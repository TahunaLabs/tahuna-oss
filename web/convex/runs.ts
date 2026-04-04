import { ConvexError, v } from "convex/values";
import { components, internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { R2 } from "@convex-dev/r2";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  buildRuntimeCompatibilityKey,
  classifyRuntimeIncompatibility,
  resolveRunpodCloudType,
  type RuntimeCompatibilityFingerprint,
} from "@/lib/runtime-incompatibility";
import { PYTHON_CONFIG, RUN_CONFIG } from "@convex/appConfig";
import { applyStorageDeltaCredits, USAGE_EVENT_TYPE, upsertLedgerDebitTotal } from "@convex/credits";
import type { ComputeSettlementResult } from "@convex/runBilling";
import { resolveConfiguredDependencyGroup } from "@/lib/dependency-selection";
import {
  buildProvisionedRuntimeEnv,
  resolveEnvironmentEnvVarsForEnvironmentId,
} from "@convex/envVars";
import {
  estimateRunUsageFromHourlyRateCents,
  runLiveDebitIdempotencyKey,
  resolveRunHourlyRateCents,
  resolveTerminalRunTiming,
  settleRunComputeCharge,
  toUnixMillis,
} from "@convex/runBilling";
import { getAccessibleRun } from "@convex/runsAccess";
import { listByUserId, toRunLogsOnlyResponse, toRunLogsResponse, toRunMetricsOnlyResponse, toRunResponse } from "@convex/runsRead";
import {
  fetchSyncManifest,
  resolveSyncManifestDownloadEntries,
  type RuntimeBootstrapEntry,
} from "@convex/runtimeBootstrap";
import {
  cancelRunForUserId,
  createRunForUserId,
  deleteRunDataBatch,
  deleteRunForUserId,
  renameRunForUserId,
  scheduleForcedPodTermination,
} from "@convex/runsLifecycle";
import {
  provisionRuntimePod,
  resolveImageName,
  resolveWandbBaseURL,
  terminateRuntimePodWithRetry,
} from "@convex/runtimeProvisioning";
import { ACTIVE_STATUSES, RUN_STATUS, TERMINAL_STATUSES } from "@convex/runsConstants";
const runResponseValidator = v.object({
  run_id: v.string(),
  name: v.string(),
  created_at: v.number(),
  uptime_ms: v.number(),
  environment_id: v.string(),
  input: v.string(),
  output: v.string(),
  logs: v.string(),
  status: v.string(),
  error: v.string(),
  pod_id: v.string(),
  effective_gpu_type: v.string(),
  effective_gpu_count: v.number(),
  effective_volume_gb: v.number(),
  code_manifest_hash: v.string(),
  data_manifest_hash: v.string(),
  cancellation_requested: v.boolean(),
  artifact_keys: v.array(v.string()),
});
const listRunsResponseValidator = v.object({
  runs: v.array(runResponseValidator),
});
const runLogsResponseValidator = v.object({
  run_id: v.string(),
  status: v.string(),
  logs_path: v.string(),
  log_file: v.string(),
  note: v.string(),
  logs_window: v.object({
    tail_limit: v.number(),
    startup_scan_limit: v.number(),
    pinned_bootstrap_limit: v.number(),
    scanned_tail: v.number(),
    scanned_startup: v.number(),
    pinned_bootstrap_count: v.number(),
    returned_logs: v.number(),
    includes_pinned_bootstrap: v.boolean(),
  }),
  metrics_window: v.object({
    scan_limit: v.number(),
    series_limit: v.number(),
    per_series_limit: v.number(),
    scanned_points: v.number(),
    scanned_series: v.number(),
    returned_series: v.number(),
    returned_points: v.number(),
    dropped_series_count: v.number(),
    dropped_points_count: v.number(),
  }),
  recent_logs: v.array(
    v.object({
      timestamp: v.number(),
      level: v.string(),
      source: v.string(),
      message: v.string(),
    }),
  ),
  recent_metrics: v.array(
    v.object({
      timestamp: v.number(),
      name: v.string(),
      value: v.number(),
      step: v.union(v.number(), v.null()),
      unit: v.union(v.string(), v.null()),
      source: v.string(),
    }),
  ),
});
const runLogsOnlyResponseValidator = v.object({
  run_id: v.string(),
  status: v.string(),
  logs_path: v.string(),
  log_file: v.string(),
  note: v.string(),
  logs_window: v.object({
    tail_limit: v.number(),
    startup_scan_limit: v.number(),
    pinned_bootstrap_limit: v.number(),
    scanned_tail: v.number(),
    scanned_startup: v.number(),
    pinned_bootstrap_count: v.number(),
    returned_logs: v.number(),
    includes_pinned_bootstrap: v.boolean(),
  }),
  recent_logs: v.array(
    v.object({
      timestamp: v.number(),
      level: v.string(),
      source: v.string(),
      message: v.string(),
    }),
  ),
});
const runMetricsOnlyResponseValidator = v.object({
  run_id: v.string(),
  status: v.string(),
  metrics_window: v.object({
    scan_limit: v.number(),
    series_limit: v.number(),
    per_series_limit: v.number(),
    scanned_points: v.number(),
    scanned_series: v.number(),
    returned_series: v.number(),
    returned_points: v.number(),
    dropped_series_count: v.number(),
    dropped_points_count: v.number(),
  }),
  recent_metrics: v.array(
    v.object({
      timestamp: v.number(),
      name: v.string(),
      value: v.number(),
      step: v.union(v.number(), v.null()),
      unit: v.union(v.string(), v.null()),
      source: v.string(),
    }),
  ),
});
const provisioningPayloadValidator = v.object({
  run_id: v.string(),
  environment_id: v.string(),
  user_id: v.string(),
  command: v.array(v.string()),
  dependency_group: v.string(),
  output_dir: v.string(),
  input_path: v.string(),
  output_path: v.string(),
  logs_path: v.string(),
  code_manifest_hash: v.union(v.string(), v.null()),
  data_manifest_hash: v.union(v.string(), v.null()),
  code_manifest_key: v.union(v.string(), v.null()),
  data_manifest_key: v.union(v.string(), v.null()),
  contract_version: v.string(),
  bootstrap_summary: v.optional(
    v.object({
      code_files: v.number(),
      code_bytes: v.number(),
      data_files: v.number(),
      data_bytes: v.number(),
    }),
  ),
  runpod_pod_id: v.optional(v.string()),
});
const runProvisionSpecValidator = v.object({
  run_id: v.string(),
  runpod_credential_id: v.id("runpodCredentials"),
  effective_gpu_type: v.string(),
  effective_gpu_count: v.number(),
  effective_volume_gb: v.number(),
  framework: v.string(),
  version: v.string(),
  python_version: v.string(),
});
const runtimeTokenRunLookupValidator = v.union(
  v.null(),
  v.object({
    runId: v.id("runs"),
    userId: v.string(),
    status: v.string(),
    runtimeTokenHash: v.string(),
  }),
);
const runtimeLogLineValidator = v.object({
  message: v.string(),
  level: v.optional(v.string()),
  source: v.optional(v.string()),
  timestamp: v.optional(v.number()),
});
const runtimeArtifactRowValidator = v.object({
  key: v.string(),
  size: v.number(),
  createdAt: v.number(),
});
const runtimeMetricSampleValidator = v.object({
  name: v.string(),
  value: v.number(),
  step: v.optional(v.number()),
  unit: v.optional(v.string()),
  source: v.optional(v.string()),
  timestamp: v.optional(v.number()),
});
const runtimeStatusValidator = v.union(
  v.literal(RUN_STATUS.PROVISIONING),
  v.literal(RUN_STATUS.RUNNING),
  v.literal(RUN_STATUS.COMPLETED),
  v.literal(RUN_STATUS.FAILED),
  v.literal(RUN_STATUS.CANCELLED),
);
const runtimeBootstrapEntryValidator = v.object({
  path: v.string(),
  sha256: v.string(),
  size: v.number(),
  mode: v.number(),
  download_url: v.string(),
});
const runtimeBootstrapPlanValidator = v.object({
  run_id: v.string(),
  contract_version: v.string(),
  workspace_root: v.string(),
  command: v.array(v.string()),
  dependency_group: v.string(),
  code: v.object({
    manifest_hash: v.string(),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
  data: v.object({
    manifest_hash: v.union(v.string(), v.null()),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
});
const runtimeCompatibilityFingerprintValidator = v.object({
  cloudType: v.string(),
  framework: v.string(),
  version: v.string(),
  pythonVersion: v.string(),
  gpuType: v.string(),
  imageName: v.string(),
});
const startupTimeoutStateValidator = v.union(
  v.null(),
  v.object({
    status: v.string(),
    cancellationRequested: v.boolean(),
    podId: v.optional(v.string()),
  }),
);

const r2 = new R2(components.r2);

type ProvisioningPayload = {
  run_id: string;
  environment_id: string;
  user_id: string;
  command: string[];
  dependency_group: string;
  output_dir: string;
  input_path: string;
  output_path: string;
  logs_path: string;
  code_manifest_hash: string | null;
  data_manifest_hash: string | null;
  code_manifest_key: string | null;
  data_manifest_key: string | null;
  contract_version: string;
  bootstrap_summary?: {
    code_files: number;
    code_bytes: number;
    data_files: number;
    data_bytes: number;
  };
  runpod_pod_id?: string;
};
type RuntimeBootstrapPlan = {
  run_id: string;
  contract_version: string;
  workspace_root: string;
  command: string[];
  dependency_group: string;
  code: {
    manifest_hash: string;
    entries: RuntimeBootstrapEntry[];
  };
  data: {
    manifest_hash: string | null;
    entries: RuntimeBootstrapEntry[];
  };
};

function storageObjectNameFromKey(key: string) {
  const leaf = key.split("/").pop();
  return (leaf && leaf.trim()) || key;
}

function isRunArtifactKey(outputPath: string, key: string) {
  const base = outputPath.trim();
  const candidate = key.trim();
  if (!base || !candidate) {
    return false;
  }
  return candidate.startsWith(`${base}/`);
}

function toObjectTimestamp(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const millis = new Date(value).getTime();
  return Number.isFinite(millis) ? millis : fallback;
}

async function upsertRunArtifactIndexRow(
  ctx: MutationCtx,
  args: {
    userId: string;
    runId: Id<"runs">;
    key: string;
    size: number;
    createdAt: number;
  },
) {
  const normalizedSize = Math.max(0, Math.floor(args.size));
  const normalizedCreatedAt = Math.max(0, Math.floor(args.createdAt));
  const existing = await ctx.db
    .query("storageObjects")
    .withIndex("by_user_and_key", (q) => q.eq("userId", args.userId).eq("key", args.key))
    .first();
  const previousSize = existing ? Math.max(0, Math.floor(existing.size || 0)) : 0;
  await applyStorageDeltaCredits(ctx, {
    userId: args.userId,
    sizeDeltaBytes: normalizedSize - previousSize,
    idempotencyKey: `storage:artifact:${args.key}:${normalizedSize}`,
    referenceType: "run_artifact",
    referenceId: args.key,
    metadata: {
      run_id: String(args.runId),
      key: args.key,
    },
  });
  const patch = {
    source: "run_artifact" as const,
    objectKind: "run_artifact" as const,
    key: args.key,
    name: storageObjectNameFromKey(args.key),
    size: normalizedSize,
    createdAt: normalizedCreatedAt,
    runId: args.runId,
    dataBlobId: undefined,
    dataId: undefined,
  };
  if (existing) {
    await ctx.db.patch("storageObjects", existing._id, patch);
    return;
  }
  await ctx.db.insert("storageObjects", {
    userId: args.userId,
    ...patch,
  });
}

function normalizeRuntimeLevel(level: string | undefined) {
  const trimmed = (level || "").trim().toLowerCase();
  if (trimmed === "debug" || trimmed === "warn" || trimmed === "warning" || trimmed === "error") {
    return trimmed === "warning" ? "warn" : trimmed;
  }
  return "info";
}

function normalizeRuntimeSource(source: string | undefined) {
  const trimmed = (source || "").trim();
  return trimmed || "pod";
}

function normalizeRuntimeTimestamp(timestamp: number | undefined) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
    return Math.floor(timestamp);
  }
  return Date.now();
}

function sanitizeRuntimeMessage(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, 4000);
}

function manifestKey(
  environmentId: Id<"environments">,
  dataId: string | undefined,
  kind: "code" | "data",
  manifestHash?: string,
) {
  if (!manifestHash) {
    return null;
  }
  if (kind === "data") {
    const resolvedDataId = dataId || String(environmentId);
    return `data/${resolvedDataId}/manifests/${manifestHash}.json`;
  }
  return `environments/${environmentId}/manifests/${kind}/${manifestHash}.json`;
}

function toProvisioningPayload(row: Doc<"runs">): ProvisioningPayload {
  const dependencyGroup = resolveConfiguredDependencyGroup({
    dependencyGroup: row.dependencyGroup,
    dependencyMode: row.dependencyMode,
  });
  if (dependencyGroup === null) {
    throw new ConvexError("run dependency selection is missing");
  }
  return {
    run_id: String(row._id),
    environment_id: String(row.environmentId),
    user_id: row.userId,
    command: row.command ?? [],
    dependency_group: dependencyGroup,
    output_dir: row.outputDir ?? "outputs",
    input_path: row.input,
    output_path: row.output,
    logs_path: row.logs,
    code_manifest_hash: row.codeManifestHash ?? null,
    data_manifest_hash: row.dataManifestHash ?? null,
    code_manifest_key: manifestKey(row.environmentId, row.dataId, "code", row.codeManifestHash),
    data_manifest_key: manifestKey(row.environmentId, row.dataId, "data", row.dataManifestHash),
    contract_version: "sync-incremental-0.1.0",
  };
}

function isS3NotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const row = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return row.name === "NotFound" || row.Code === "NotFound" || row.$metadata?.httpStatusCode === 404;
}

async function getSignedDownloadUrlByHead(key: string): Promise<string | null> {
  try {
    await r2.client.send(
      new HeadObjectCommand({
        Bucket: r2.config.bucket,
        Key: key,
      }),
    );
    return r2.getUrl(key);
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

function normalizeCompatibilityFingerprint(
  fingerprint: RuntimeCompatibilityFingerprint,
): RuntimeCompatibilityFingerprint {
  return {
    cloudType: fingerprint.cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE",
    framework: fingerprint.framework.trim(),
    version: fingerprint.version.trim(),
    pythonVersion: fingerprint.pythonVersion.trim(),
    gpuType: fingerprint.gpuType.trim(),
    imageName: fingerprint.imageName.trim(),
  };
}

// ---------- public (auth via ctx.auth) ----------

export const list = query({
  args: {},
  returns: listRunsResponseValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listByUserId(ctx, String(user._id));
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getAccessibleRun(ctx, String(user._id), args.runId, "read");
    return toRunResponse(row);
  },
});

export const getLogs = query({
  args: { runId: v.id("runs") },
  returns: runLogsResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getAccessibleRun(ctx, String(user._id), args.runId, "read");
    return toRunLogsResponse(ctx, row);
  },
});

export const getRunLogs = query({
  args: { runId: v.id("runs") },
  returns: runLogsOnlyResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getAccessibleRun(ctx, String(user._id), args.runId, "read");
    return toRunLogsOnlyResponse(ctx, row);
  },
});

export const getRunMetrics = query({
  args: { runId: v.id("runs") },
  returns: runMetricsOnlyResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getAccessibleRun(ctx, String(user._id), args.runId, "read");
    return toRunMetricsOnlyResponse(ctx, row);
  },
});

export const internalGetLogs = internalQuery({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: runLogsResponseValidator,
  handler: async (ctx, args) => {
    const row = await getAccessibleRun(ctx, args.userId, args.runId, "read");
    return toRunLogsResponse(ctx, row);
  },
});

export const create = mutation({
  args: {
    environmentId: v.id("environments"),
    name: v.optional(v.string()),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
  },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createRunForUserId(ctx, {
      userId: String(user._id),
      environmentId: args.environmentId,
      name: args.name,
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
    });
  },
});

export const remove = mutation({
  args: {
    runId: v.id("runs"),
    cancelActive: v.optional(v.boolean()),
    force: v.optional(v.boolean()),
  },
  returns: v.object({ deleted: v.boolean(), run_id: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return deleteRunForUserId(ctx, String(user._id), args.runId, {
      cancelActive: args.cancelActive === true,
      force: args.force === true,
    });
  },
});

export const cancel = mutation({
  args: { runId: v.id("runs"), force: v.optional(v.boolean()) },
  returns: v.object({ cancel_requested: v.boolean(), forced: v.boolean(), run_id: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return cancelRunForUserId(ctx, String(user._id), args.runId, args.force === true);
  },
});

// ---------- internal (for CLI proxy routes that pass userId explicitly) ----------

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listRunsResponseValidator,
  handler: async (ctx, args) => {
    return listByUserId(ctx, args.userId);
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    const row = await getAccessibleRun(ctx, args.userId, args.runId, "read");
    return toRunResponse(row);
  },
});

export const internalGetByRuntimeTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  returns: runtimeTokenRunLookupValidator,
  handler: async (ctx, args) => {
    const tokenHash = args.tokenHash.trim();
    if (!tokenHash) {
      return null;
    }
    const row = await ctx.db
      .query("runs")
      .withIndex("by_runtime_token_hash", (q) => q.eq("runtimeTokenHash", tokenHash))
      .first();
    if (!row || !row.runtimeTokenHash || row.runtimeTokenHash === "revoked") {
      return null;
    }
    return {
      runId: row._id,
      userId: row.userId,
      status: row.status,
      runtimeTokenHash: row.runtimeTokenHash,
    };
  },
});

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    name: v.optional(v.string()),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
    enqueue_provisioning: v.optional(v.boolean()),
  },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    return createRunForUserId(ctx, args);
  },
});

export const billRunningComputeMinute = internalMutation({
  args: {},
  returns: v.object({
    processed_runs: v.number(),
    charged_runs: v.number(),
    owed_runs: v.number(),
    skipped_runs: v.number(),
  }),
  handler: async (ctx) => {
    const nowMs = Date.now();
    const runningRuns = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", RUN_STATUS.RUNNING))
      .collect();

    let processedRuns = 0;
    let chargedRuns = 0;
    let owedRuns = 0;
    let skippedRuns = 0;

    for (const row of runningRuns) {
      const startedAt = typeof row.computeStartedAt === "number" ? toUnixMillis(row.computeStartedAt) : 0;
      if (startedAt <= 0) {
        skippedRuns += 1;
        continue;
      }

      const durationMs = Math.max(0, nowMs - startedAt);
      let hourlyRateCents = 0;
      try {
        hourlyRateCents = resolveRunHourlyRateCents(row);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "run hourly rate is invalid";
        await ctx.db.patch("runs", row._id, {
          computeChargeStatus: "owed",
          computeChargeError: detail,
        });
        owedRuns += 1;
        continue;
      }

      const targetChargeCents = estimateRunUsageFromHourlyRateCents({
        hourlyRateCents,
        durationMs,
      });
      const runId = String(row._id);
      const currentCollectedCents = Math.max(0, Math.floor(row.computeCollectedCents || 0));
      const debitDeltaCents = targetChargeCents - currentCollectedCents;
      let nextCollectedCents = currentCollectedCents;
      let nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
      let nextChargeStatus: "pending" | "charged" | "owed" =
        targetChargeCents > 0 ? (nextOutstandingCents > 0 ? "owed" : "charged") : "pending";
      let nextChargeError: string | undefined = undefined;

      if (debitDeltaCents > 0) {
        const appliedDebit = await upsertLedgerDebitTotal(ctx, {
          userId: row.userId,
          targetDebitCents: targetChargeCents,
          eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_DEBIT,
          idempotencyKey: runLiveDebitIdempotencyKey(runId),
          referenceType: "run",
          referenceId: runId,
          metadata: {
            settlement: "live_tick",
            charge_cents: targetChargeCents,
            duration_ms: durationMs,
            gpu_type: row.effectiveGpuType,
            gpu_count: row.effectiveGpuCount,
            volume_gb: row.effectiveVolumeGb,
            hourly_rate_cents: hourlyRateCents,
          },
        });
        nextCollectedCents = Math.min(targetChargeCents, appliedDebit.debitedCents);
        if (nextCollectedCents > currentCollectedCents) {
          chargedRuns += 1;
        }
      }

      nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
      if (nextOutstandingCents > 0) {
        nextChargeStatus = "owed";
        nextChargeError = "outstanding compute settlement";
        owedRuns += 1;
      } else if (targetChargeCents > 0) {
        nextChargeStatus = "charged";
      } else {
        nextChargeStatus = "pending";
      }

      const previousChargeCents = Math.max(0, Math.floor(row.computeChargeCents || 0));
      const previousCollectedCents = Math.max(0, Math.floor(row.computeCollectedCents || 0));
      const previousOutstandingCents = Math.max(0, Math.floor(row.computeOutstandingCents || 0));
      const previousChargeStatus = row.computeChargeStatus || "pending";
      const previousChargeError = row.computeChargeError;
      if (
        previousChargeCents !== targetChargeCents ||
        previousCollectedCents !== nextCollectedCents ||
        previousOutstandingCents !== nextOutstandingCents ||
        previousChargeStatus !== nextChargeStatus ||
        previousChargeError !== nextChargeError
      ) {
        await ctx.db.patch("runs", row._id, {
          computeChargeCents: targetChargeCents,
          computeCollectedCents: nextCollectedCents,
          computeOutstandingCents: nextOutstandingCents,
          computeChargeStatus: nextChargeStatus,
          computeChargeError: nextChargeError,
        });
        processedRuns += 1;
      } else {
        skippedRuns += 1;
      }
    }

    return {
      processed_runs: processedRuns,
      charged_runs: chargedRuns,
      owed_runs: owedRuns,
      skipped_runs: skippedRuns,
    };
  },
});

export const internalRemove = internalMutation({
  args: {
    userId: v.string(),
    runId: v.id("runs"),
    cancelActive: v.optional(v.boolean()),
    force: v.optional(v.boolean()),
  },
  returns: v.object({ deleted: v.boolean(), run_id: v.string() }),
  handler: async (ctx, args) => {
    return deleteRunForUserId(ctx, args.userId, args.runId, {
      cancelActive: args.cancelActive === true,
      force: args.force === true,
    });
  },
});

export const internalDeleteRunData = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasMore = await deleteRunDataBatch(ctx, args.runId);
    if (hasMore) {
      await ctx.scheduler.runAfter(0, internal.runs.internalDeleteRunData, {
        runId: args.runId,
      });
    } else {
      await ctx.db.delete("runs", args.runId);
    }
    return null;
  },
});

export const internalCancel = internalMutation({
  args: { userId: v.string(), runId: v.id("runs"), force: v.optional(v.boolean()) },
  returns: v.object({ cancel_requested: v.boolean(), forced: v.boolean(), run_id: v.string() }),
  handler: async (ctx, args) => {
    return cancelRunForUserId(ctx, args.userId, args.runId, args.force === true);
  },
});

export const markCancelledAfterTermination = internalMutation({
  args: { runId: v.id("runs"), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || !row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    const terminalTiming = resolveTerminalRunTiming(row);
    const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
    await ctx.db.patch("runs", args.runId, {
      status: RUN_STATUS.CANCELLED,
      computeEndedAt: terminalTiming.computeEndedAt,
      computeChargeCents: settlement.chargeCents,
      computeCollectedCents: settlement.collectedCents,
      computeOutstandingCents: settlement.outstandingCents,
      computeChargeStatus: settlement.chargeStatus,
      computeChargeError: settlement.chargeError,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.CANCELLED,
      message: args.force === true ? "force cancellation completed" : "cancellation completed",
      metadata: {
        duration_ms: terminalTiming.durationMs,
        compute_charge_cents: settlement.chargeCents,
        compute_charge_delta_cents: settlement.chargeDeltaCents,
        compute_charge_status: settlement.chargeStatus,
        compute_charge_error: settlement.chargeError,
        balance_after_cents: settlement.balanceAfterCents,
      },
    });
    return null;
  },
});

export const markCancellationTerminationFailed = internalMutation({
  args: { runId: v.id("runs"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || !row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    const errorText = sanitizeRuntimeMessage(args.error) || "failed to terminate pod during cancellation";
    const terminalTiming = resolveTerminalRunTiming(row);
    const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
    await ctx.db.patch("runs", args.runId, {
      status: RUN_STATUS.FAILED,
      error: `cancellation failed: ${errorText}`,
      runtimeTokenHash: "revoked",
      computeEndedAt: terminalTiming.computeEndedAt,
      computeChargeCents: settlement.chargeCents,
      computeCollectedCents: settlement.collectedCents,
      computeOutstandingCents: settlement.outstandingCents,
      computeChargeStatus: settlement.chargeStatus,
      computeChargeError: settlement.chargeError,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.FAILED,
      message: "cancellation termination failed",
      metadata: {
        error: errorText,
        duration_ms: terminalTiming.durationMs,
        compute_charge_cents: settlement.chargeCents,
        compute_charge_delta_cents: settlement.chargeDeltaCents,
        compute_charge_status: settlement.chargeStatus,
        compute_charge_error: settlement.chargeError,
        balance_after_cents: settlement.balanceAfterCents,
      },
    });
    return null;
  },
});

export const scheduleTerminationRetry = internalMutation({
  args: {
    runId: v.id("runs"),
    podId: v.string(),
    runpodCredentialId: v.optional(v.id("runpodCredentials")),
    force: v.optional(v.boolean()),
    attempt: v.number(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || !row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.CANCELLING,
      message: `retrying pod termination (attempt ${args.attempt}/${RUN_CONFIG.terminationRetryMaxAttempts})`,
      metadata: {
        error: args.error,
      },
    });
    await ctx.scheduler.runAfter(
      RUN_CONFIG.terminationRetryDelaySeconds * 1000,
      internal.runs.internalTerminatePod,
      {
        runId: args.runId,
        podId: args.podId,
        runpodCredentialId: args.runpodCredentialId,
        force: args.force === true,
        attempt: args.attempt,
      },
    );
    return null;
  },
});

export const internalRename = internalMutation({
  args: { userId: v.string(), runId: v.id("runs"), name: v.string() },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    return renameRunForUserId(ctx, args.userId, args.runId, args.name);
  },
});

export const internalTerminatePod = internalAction({
  args: {
    runId: v.id("runs"),
    podId: v.string(),
    runpodCredentialId: v.optional(v.id("runpodCredentials")),
    force: v.optional(v.boolean()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await terminateRuntimePodWithRetry({
      ctx,
      podId: args.podId,
      runpodCredentialId: args.runpodCredentialId ?? null,
      attempt: args.attempt ?? 0,
      shouldTerminate: async () =>
        await ctx.runQuery(internal.runs.internalShouldTerminatePod, {
          runId: args.runId,
          force: args.force === true,
        }),
      resolveCredentialId: async () =>
        await ctx.runQuery(internal.runs.internalGetRunpodCredentialId, { runId: args.runId }),
      onTerminated: async () => {
        await ctx.runMutation(internal.runs.markCancelledAfterTermination, {
          runId: args.runId,
          force: args.force === true,
        });
      },
      onRetry: async ({ nextAttempt, runpodCredentialId, error }) => {
        if (nextAttempt < RUN_CONFIG.terminationRetryMaxAttempts) {
          await ctx.runMutation(internal.runs.scheduleTerminationRetry, {
            runId: args.runId,
            podId: args.podId,
            runpodCredentialId,
            force: args.force === true,
            attempt: nextAttempt,
            error,
          });
          return;
        }
        await ctx.runMutation(internal.runs.markCancellationTerminationFailed, {
          runId: args.runId,
          error: `${error} (retries exhausted)`,
        });
      },
    });
  },
});

// ---------- internal lifecycle ----------

export const internalGetProvisioningPayload = internalQuery({
  args: { runId: v.id("runs") },
  returns: provisioningPayloadValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      throw new ConvexError("run not found");
    }
    return toProvisioningPayload(row);
  },
});

export const internalGetRunProvisionSpec = internalQuery({
  args: { runId: v.id("runs") },
  returns: runProvisionSpecValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      throw new ConvexError("run not found");
    }
    const env = await ctx.db.get("environments", row.environmentId);
    if (!env) {
      throw new ConvexError("environment not found");
    }
    if (!row.runpodCredentialId) {
      throw new ConvexError("run is missing its Runpod credential");
    }
    return {
      run_id: String(row._id),
      runpod_credential_id: row.runpodCredentialId,
      effective_gpu_type: row.effectiveGpuType || env.gpuType,
      effective_gpu_count: row.effectiveGpuCount || env.gpuCount,
      effective_volume_gb: row.effectiveVolumeGb || env.volumeGb,
      framework: env.framework,
      version: env.version,
      python_version: env.pythonVersion || PYTHON_CONFIG.defaultVersion,
    };
  },
});

export const internalGetRunpodCredentialId = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(v.id("runpodCredentials"), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    return row?.runpodCredentialId ?? null;
  },
});

export const internalValidateRuntimeToken = internalQuery({
  args: { runId: v.id("runs"), tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || !row.runtimeTokenHash) {
      return false;
    }
    return row.runtimeTokenHash === args.tokenHash;
  },
});

export const internalGetRuntimeBootstrapPlan = internalAction({
  args: { runId: v.id("runs") },
  returns: runtimeBootstrapPlanValidator,
  handler: async (ctx, args): Promise<RuntimeBootstrapPlan> => {
    const provisioningPayload: ProvisioningPayload = await ctx.runQuery(
      internal.runs.internalGetProvisioningPayload,
      {
        runId: args.runId,
      },
    );
    const codeManifestHash = provisioningPayload.code_manifest_hash;
    const dataManifestHash = provisioningPayload.data_manifest_hash;
    const codeManifestKey = provisioningPayload.code_manifest_key;
    const dataManifestKey = provisioningPayload.data_manifest_key;
    if (!codeManifestHash || !codeManifestKey) {
      throw new Error("missing pinned code manifest hash/key in provisioning payload");
    }

    const codeManifest = await fetchSyncManifest(ctx, "code", codeManifestKey, codeManifestHash);
    const codeEntries = await resolveSyncManifestDownloadEntries(ctx, "code", codeManifest);
    let dataEntries: RuntimeBootstrapEntry[] = [];
    if (dataManifestHash && dataManifestKey) {
      const dataManifest = await fetchSyncManifest(ctx, "data", dataManifestKey, dataManifestHash);
      dataEntries = await resolveSyncManifestDownloadEntries(ctx, "data", dataManifest);
    }

    return {
      run_id: provisioningPayload.run_id,
      contract_version: provisioningPayload.contract_version,
      workspace_root: "/workspace",
      command: provisioningPayload.command,
      dependency_group: provisioningPayload.dependency_group,
      code: {
        manifest_hash: codeManifestHash,
        entries: codeEntries,
      },
      data: {
        manifest_hash: dataManifestHash ?? null,
        entries: dataEntries,
      },
    };
  },
});

export const internalShouldAbortProvisioning = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return true;
    }
    return row.cancellationRequested || TERMINAL_STATUSES.has(row.status);
  },
});

export const internalShouldTerminatePod = internalQuery({
  args: { runId: v.id("runs"), force: v.optional(v.boolean()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (args.force === true) {
      // Force paths (including environment cleanup) should terminate even if the run row is gone.
      return true;
    }
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return false;
    }
    if (!row.cancellationRequested) {
      return false;
    }
    return ACTIVE_STATUSES.has(row.status);
  },
});

export const internalGetStartupTimeoutState = internalQuery({
  args: { runId: v.id("runs") },
  returns: startupTimeoutStateValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    return {
      status: row.status,
      cancellationRequested: row.cancellationRequested,
      podId: row.podId,
    };
  },
});

export const upsertRuntimeIncompatibility = internalMutation({
  args: {
    runId: v.id("runs"),
    podId: v.optional(v.string()),
    fingerprint: runtimeCompatibilityFingerprintValidator,
    errorCode: v.string(),
    errorDetail: v.string(),
    cooldownSeconds: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fingerprint = normalizeCompatibilityFingerprint(args.fingerprint as RuntimeCompatibilityFingerprint);
    if (!fingerprint.framework || !fingerprint.version || !fingerprint.pythonVersion || !fingerprint.gpuType || !fingerprint.imageName) {
      return null;
    }
    const key = buildRuntimeCompatibilityKey(fingerprint);
    const now = Date.now();
    const cooldownMs = Math.max(0, Math.floor(args.cooldownSeconds * 1000));
    const nextCooldownUntil = now + cooldownMs;
    const normalizedDetail = sanitizeRuntimeMessage(args.errorDetail) || "runtime startup incompatibility";
    const existing = await ctx.db
      .query("runtimeIncompatibilities")
      .withIndex("by_key", (q) => q.eq("compatibilityKey", key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        errorCode: args.errorCode.trim() || existing.errorCode,
        errorDetail: normalizedDetail,
        lastFailedAt: now,
        failureCount: Math.max(1, Math.floor(existing.failureCount || 0)) + 1,
        cooldownUntil: Math.max(existing.cooldownUntil || 0, nextCooldownUntil),
        lastRunId: args.runId,
        lastPodId: args.podId?.trim() || existing.lastPodId,
      });
      return null;
    }
    await ctx.db.insert("runtimeIncompatibilities", {
      compatibilityKey: key,
      cloudType: fingerprint.cloudType,
      framework: fingerprint.framework,
      version: fingerprint.version,
      pythonVersion: fingerprint.pythonVersion,
      gpuType: fingerprint.gpuType,
      imageName: fingerprint.imageName,
      errorCode: args.errorCode.trim() || "runtime_incompatibility",
      errorDetail: normalizedDetail,
      firstFailedAt: now,
      lastFailedAt: now,
      failureCount: 1,
      cooldownUntil: nextCooldownUntil,
      lastRunId: args.runId,
      lastPodId: args.podId?.trim() || undefined,
    });
    return null;
  },
});

export const setRuntimeTokenHash = internalMutation({
  args: { runId: v.id("runs"), runtimeTokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    await ctx.db.patch("runs", args.runId, { runtimeTokenHash: args.runtimeTokenHash });
    return null;
  },
});

export const enforceProvisioningStartupTimeout = internalAction({
  args: {
    runId: v.id("runs"),
    podId: v.string(),
    runpodCredentialId: v.id("runpodCredentials"),
    fingerprint: runtimeCompatibilityFingerprintValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internal.runs.internalGetStartupTimeoutState, {
      runId: args.runId,
    });
    if (!state || state.cancellationRequested || TERMINAL_STATUSES.has(state.status)) {
      return null;
    }
    if (state.status !== RUN_STATUS.PROVISIONING) {
      return null;
    }
    if ((state.podId || "") !== args.podId) {
      return null;
    }
    const detail = `startup timeout: timed out waiting for runtime startup heartbeat after ${RUN_CONFIG.startupTimeoutSeconds}s`;
    const incompatibility = classifyRuntimeIncompatibility(detail);
    if (incompatibility) {
      await ctx.runMutation(internal.runs.upsertRuntimeIncompatibility, {
        runId: args.runId,
        podId: args.podId,
        fingerprint: args.fingerprint,
        errorCode: incompatibility.code,
        errorDetail: detail,
        cooldownSeconds: incompatibility.cooldownSeconds,
      });
    }
    await ctx.runMutation(internal.runs.markFailed, {
      runId: args.runId,
      error: `pod bootstrap failed: ${detail}`,
    });
    await ctx.runAction(internal.runs.internalTerminatePod, {
      runId: args.runId,
      podId: args.podId,
      runpodCredentialId: args.runpodCredentialId,
      force: true,
    });
    return null;
  },
});

export const provisionRun = internalAction({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const provisioningPayload = await ctx.runQuery(internal.runs.internalGetProvisioningPayload, {
      runId: args.runId,
    });
    const runSpec = await ctx.runQuery(internal.runs.internalGetRunProvisionSpec, {
      runId: args.runId,
    });
    await ctx.runMutation(internal.runs.markProvisioning, {
      runId: args.runId,
      provisioningPayload,
    });
    if (await ctx.runQuery(internal.runs.internalShouldAbortProvisioning, { runId: args.runId })) {
      return null;
    }
    const environmentEnv = await resolveEnvironmentEnvVarsForEnvironmentId(
      ctx,
      provisioningPayload.environment_id as Id<"environments">,
    );
    const compatibilityFingerprint = normalizeCompatibilityFingerprint({
      cloudType: resolveRunpodCloudType(),
      framework: runSpec.framework,
      version: runSpec.version,
      pythonVersion: runSpec.python_version,
      gpuType: runSpec.effective_gpu_type,
      imageName: resolveImageName(runSpec.framework, runSpec.version, runSpec.python_version),
    });
    let provisionedPodId = "";
    try {
      const codeManifestHash = provisioningPayload.code_manifest_hash;
      const dataManifestHash = provisioningPayload.data_manifest_hash;
      const codeManifestKey = provisioningPayload.code_manifest_key;
      const dataManifestKey = provisioningPayload.data_manifest_key;
      if (!codeManifestHash || !codeManifestKey) {
        throw new Error("missing pinned code manifest hash/key in provisioning payload");
      }

      await fetchSyncManifest(ctx, "code", codeManifestKey, codeManifestHash);
      if (dataManifestHash && dataManifestKey) {
        await fetchSyncManifest(ctx, "data", dataManifestKey, dataManifestHash);
      }
      const provisionResult = await provisionRuntimePod({
        ctx,
        shouldAbort: async () =>
          await ctx.runQuery(internal.runs.internalShouldAbortProvisioning, { runId: args.runId }),
        setRuntimeTokenHash: async (runtimeTokenHash) => {
          await ctx.runMutation(internal.runs.setRuntimeTokenHash, {
            runId: args.runId,
            runtimeTokenHash,
          });
        },
        createPod: {
          name: `tahuna-${String(args.runId)}`,
          runpodCredentialId: runSpec.runpod_credential_id,
          imageName: compatibilityFingerprint.imageName,
          gpuType: runSpec.effective_gpu_type,
          gpuCount: runSpec.effective_gpu_count,
          volumeGb: runSpec.effective_volume_gb,
        },
        buildEnv: ({ runtimeToken, runtimeApiBase, runtimeRequestTimeoutSeconds }) =>
          buildProvisionedRuntimeEnv({
            defaultEnv: {
              WANDB_API_KEY: runtimeToken,
              WANDB_BASE_URL: resolveWandbBaseURL(runtimeApiBase),
            },
            environmentEnv,
            systemEnv: {
              TAHUNA_RUN_ID: provisioningPayload.run_id,
              TAHUNA_ENVIRONMENT_ID: provisioningPayload.environment_id,
              TAHUNA_CONTRACT_VERSION: provisioningPayload.contract_version,
              TAHUNA_INPUT_PATH: provisioningPayload.input_path,
              TAHUNA_OUTPUT_DIR: provisioningPayload.output_dir,
              TAHUNA_OUTPUT_PATH: provisioningPayload.output_path,
              TAHUNA_LOGS_PATH: provisioningPayload.logs_path,
              TAHUNA_CODE_MANIFEST_HASH: provisioningPayload.code_manifest_hash || "",
              TAHUNA_DATA_MANIFEST_HASH: provisioningPayload.data_manifest_hash || "",
              TAHUNA_CODE_MANIFEST_KEY: provisioningPayload.code_manifest_key || "",
              TAHUNA_DATA_MANIFEST_KEY: provisioningPayload.data_manifest_key || "",
              TAHUNA_API_BASE: runtimeApiBase,
              TAHUNA_RUNTIME_TOKEN: runtimeToken,
              TAHUNA_WORKSPACE_ROOT: "/workspace",
              TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS: runtimeRequestTimeoutSeconds,
              TAHUNA_CANCELLATION_GRACE_SECONDS: String(RUN_CONFIG.cancellationGraceSeconds),
            },
          }),
      });
      if (!provisionResult) {
        return null;
      }
      provisionedPodId = provisionResult.podId;
      await ctx.runMutation(internal.runs.markPodProvisioned, {
        runId: args.runId,
        podId: provisionResult.podId,
        runpodResponse: provisionResult.rawResponse,
      });
      await ctx.scheduler.runAfter(
        RUN_CONFIG.startupTimeoutSeconds * 1000,
        internal.runs.enforceProvisioningStartupTimeout,
        {
          runId: args.runId,
          podId: provisionResult.podId,
          runpodCredentialId: runSpec.runpod_credential_id,
          fingerprint: compatibilityFingerprint,
        },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "pod bootstrap failed";
      const incompatibility = classifyRuntimeIncompatibility(detail);
      if (incompatibility) {
        await ctx.runMutation(internal.runs.upsertRuntimeIncompatibility, {
          runId: args.runId,
          podId: provisionedPodId || undefined,
          fingerprint: compatibilityFingerprint,
          errorCode: incompatibility.code,
          errorDetail: detail,
          cooldownSeconds: incompatibility.cooldownSeconds,
        });
      }
      await ctx.runMutation(internal.runs.markFailed, {
        runId: args.runId,
        error: `pod bootstrap failed: ${detail}`,
        provisioningPayload,
      });
      if (provisionedPodId) {
        await ctx.runAction(internal.runs.internalTerminatePod, {
          runId: args.runId,
          podId: provisionedPodId,
          runpodCredentialId: runSpec.runpod_credential_id,
          force: true,
        });
      }
    }
    return null;
  },
});

export const markPodProvisioned = internalMutation({
  args: {
    runId: v.id("runs"),
    podId: v.string(),
    runpodResponse: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    await ctx.db.patch("runs", args.runId, {
      podId: args.podId,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.PROVISIONING,
      message: "gpu pod provisioned",
      metadata: {
        pod_id: args.podId,
        runpod_response: args.runpodResponse,
      },
    });
    return null;
  },
});

export const markProvisioning = internalMutation({
  args: { runId: v.id("runs"), provisioningPayload: v.optional(provisioningPayloadValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      if (row?.cancellationRequested) {
        const terminalTiming = resolveTerminalRunTiming(row);
        const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
        await ctx.db.patch("runs", args.runId, {
          status: RUN_STATUS.CANCELLED,
          computeEndedAt: terminalTiming.computeEndedAt,
          computeChargeCents: settlement.chargeCents,
          computeCollectedCents: settlement.collectedCents,
          computeOutstandingCents: settlement.outstandingCents,
          computeChargeStatus: settlement.chargeStatus,
          computeChargeError: settlement.chargeError,
        });
      }
      return null;
    }
    await ctx.db.patch("runs", args.runId, { status: RUN_STATUS.PROVISIONING });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.PROVISIONING,
      message: "pod bootstrap started",
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
            fetch_strategy: "pod bootstrap downloads pinned code/data manifests and blobs into /workspace",
          }
        : undefined,
    });
    return null;
  },
});

export const markRunning = internalMutation({
  args: { runId: v.id("runs"), provisioningPayload: v.optional(provisioningPayloadValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      if (row?.cancellationRequested) {
        const terminalTiming = resolveTerminalRunTiming(row);
        const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
        await ctx.db.patch("runs", args.runId, {
          status: RUN_STATUS.CANCELLED,
          computeEndedAt: terminalTiming.computeEndedAt,
          computeChargeCents: settlement.chargeCents,
          computeCollectedCents: settlement.collectedCents,
          computeOutstandingCents: settlement.outstandingCents,
          computeChargeStatus: settlement.chargeStatus,
          computeChargeError: settlement.chargeError,
        });
      }
      return null;
    }

    await ctx.db.patch("runs", args.runId, {
      status: RUN_STATUS.RUNNING,
      computeStartedAt: row.computeStartedAt ?? Date.now(),
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.RUNNING,
      message: "pod running",
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
            fetch_strategy: "pod runtime is active and reporting logs/metrics via runtime endpoints",
          }
        : undefined,
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    runId: v.id("runs"),
    error: v.string(),
    provisioningPayload: v.optional(provisioningPayloadValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }
    const errorText = args.error.trim() || "pod bootstrap failed";
    const terminalTiming = resolveTerminalRunTiming(row);
    const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
    await ctx.db.patch("runs", args.runId, {
      status: RUN_STATUS.FAILED,
      error: errorText,
      runtimeTokenHash: "revoked",
      computeEndedAt: terminalTiming.computeEndedAt,
      computeChargeCents: settlement.chargeCents,
      computeCollectedCents: settlement.collectedCents,
      computeOutstandingCents: settlement.outstandingCents,
      computeChargeStatus: settlement.chargeStatus,
      computeChargeError: settlement.chargeError,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: RUN_STATUS.FAILED,
      message: errorText,
      metadata: {
        duration_ms: terminalTiming.durationMs,
        compute_charge_cents: settlement.chargeCents,
        compute_charge_delta_cents: settlement.chargeDeltaCents,
        compute_charge_status: settlement.chargeStatus,
        compute_charge_error: settlement.chargeError,
        balance_after_cents: settlement.balanceAfterCents,
        ...(args.provisioningPayload
          ? {
              provisioning_payload: args.provisioningPayload,
            }
          : {}),
      },
    });
    await scheduleForcedPodTermination(ctx, args.runId, row.podId, row.runpodCredentialId);
    return null;
  },
});

export const ingestRuntimeLogs = internalMutation({
  args: {
    runId: v.id("runs"),
    lines: v.array(runtimeLogLineValidator),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { accepted: 0 };
    }
    let accepted = 0;
    for (const line of args.lines.slice(0, 500)) {
      const message = sanitizeRuntimeMessage(line.message);
      if (!message) {
        continue;
      }
      await ctx.db.insert("runRuntimeLogs", {
        runId: args.runId,
        timestamp: normalizeRuntimeTimestamp(line.timestamp),
        level: normalizeRuntimeLevel(line.level),
        source: normalizeRuntimeSource(line.source),
        message,
      });
      accepted += 1;
    }
    return { accepted };
  },
});

export const ingestRuntimeMetrics = internalMutation({
  args: {
    runId: v.id("runs"),
    metrics: v.array(runtimeMetricSampleValidator),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { accepted: 0 };
    }
    let accepted = 0;
    for (const metric of args.metrics.slice(0, 500)) {
      const name = metric.name.trim().slice(0, 120);
      if (!name || !Number.isFinite(metric.value)) {
        continue;
      }
      await ctx.db.insert("runRuntimeMetrics", {
        runId: args.runId,
        timestamp: normalizeRuntimeTimestamp(metric.timestamp),
        name,
        value: metric.value,
        step:
          typeof metric.step === "number" && Number.isFinite(metric.step)
            ? Math.floor(metric.step)
            : undefined,
        unit: metric.unit?.trim() ? metric.unit.trim().slice(0, 32) : undefined,
        source: normalizeRuntimeSource(metric.source),
      });
      accepted += 1;
    }
    return { accepted };
  },
});

export const ingestRuntimeStatus = internalMutation({
  args: {
    runId: v.id("runs"),
    status: runtimeStatusValidator,
    message: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { status: "missing" };
    }
    if (TERMINAL_STATUSES.has(row.status)) {
      return { status: row.status };
    }

    let status = args.status;
    if (row.cancellationRequested && (status === RUN_STATUS.PROVISIONING || status === RUN_STATUS.RUNNING)) {
      status = RUN_STATUS.CANCELLED;
    }
    if (row.status === RUN_STATUS.RUNNING && status === RUN_STATUS.PROVISIONING) {
      status = RUN_STATUS.RUNNING;
    }

    if (status === RUN_STATUS.FAILED) {
      const errorText = sanitizeRuntimeMessage(args.error || args.message || "runtime failed") || "runtime failed";
      const terminalTiming = resolveTerminalRunTiming(row);
      const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
      await ctx.db.patch("runs", args.runId, {
        status: RUN_STATUS.FAILED,
        error: errorText,
        runtimeTokenHash: "revoked",
        computeEndedAt: terminalTiming.computeEndedAt,
        computeChargeCents: settlement.chargeCents,
        computeCollectedCents: settlement.collectedCents,
        computeOutstandingCents: settlement.outstandingCents,
        computeChargeStatus: settlement.chargeStatus,
        computeChargeError: settlement.chargeError,
      });
      await ctx.db.insert("runEvents", {
        runId: args.runId,
        status: RUN_STATUS.FAILED,
        message: errorText,
        metadata: {
          source: "pod-runtime",
          duration_ms: terminalTiming.durationMs,
          compute_charge_cents: settlement.chargeCents,
          compute_charge_delta_cents: settlement.chargeDeltaCents,
          compute_charge_status: settlement.chargeStatus,
          compute_charge_error: settlement.chargeError,
          balance_after_cents: settlement.balanceAfterCents,
        },
      });
      await scheduleForcedPodTermination(ctx, args.runId, row.podId, row.runpodCredentialId);
      return { status: RUN_STATUS.FAILED };
    }

    const patch: {
      status: string;
      runtimeTokenHash?: string;
      computeStartedAt?: number;
      computeEndedAt?: number;
      computeChargeCents?: number;
      computeCollectedCents?: number;
      computeOutstandingCents?: number;
      computeChargeStatus?: "charged" | "owed";
      computeChargeError?: string;
    } = { status };
    if (status === RUN_STATUS.RUNNING) {
      patch.computeStartedAt = row.computeStartedAt ?? Date.now();
    }
    const isTerminalStatus = status === RUN_STATUS.COMPLETED || status === RUN_STATUS.CANCELLED;
    let terminalTiming: { computeEndedAt?: number; durationMs: number } | undefined;
    let settlement: ComputeSettlementResult | undefined;
    if (isTerminalStatus) {
      terminalTiming = resolveTerminalRunTiming(row);
      settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
      patch.computeEndedAt = terminalTiming.computeEndedAt;
      patch.computeChargeCents = settlement.chargeCents;
      patch.computeCollectedCents = settlement.collectedCents;
      patch.computeOutstandingCents = settlement.outstandingCents;
      patch.computeChargeStatus = settlement.chargeStatus;
      patch.computeChargeError = settlement.chargeError;
    }
    if (status === RUN_STATUS.COMPLETED || status === RUN_STATUS.CANCELLED) {
      patch.runtimeTokenHash = "revoked";
    }
    await ctx.db.patch("runs", args.runId, patch);
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status,
      message:
        sanitizeRuntimeMessage(args.message || `runtime status: ${status}`) ||
        `runtime status: ${status}`,
      metadata: {
        source: "pod-runtime",
        ...(terminalTiming ? { duration_ms: terminalTiming.durationMs } : {}),
        ...(settlement
          ? {
              compute_charge_cents: settlement.chargeCents,
              compute_charge_delta_cents: settlement.chargeDeltaCents,
              compute_charge_status: settlement.chargeStatus,
              compute_charge_error: settlement.chargeError,
              balance_after_cents: settlement.balanceAfterCents,
            }
          : {}),
      },
    });
    if (status === RUN_STATUS.COMPLETED || status === RUN_STATUS.CANCELLED) {
      await scheduleForcedPodTermination(ctx, args.runId, row.podId, row.runpodCredentialId);
    }
    return { status };
  },
});

export const ingestRuntimeArtifacts = internalAction({
  args: {
    runId: v.id("runs"),
    keys: v.array(v.string()),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args): Promise<{ accepted: number }> => {
    const commitContext = await ctx.runQuery(internal.runs.internalGetRunArtifactCommitContext, {
      runId: args.runId,
    });
    if (!commitContext) {
      return { accepted: 0 };
    }
    const validArtifacts: Array<{ key: string; size: number; createdAt: number }> = [];
    const inputSeen = new Set<string>();
    for (const rawKey of args.keys) {
      const key = rawKey.trim();
      if (!key || inputSeen.has(key)) {
        continue;
      }
      inputSeen.add(key);
      if (!isRunArtifactKey(commitContext.outputPath, key)) {
        continue;
      }
      const metadata = await r2.getMetadata(ctx, key);
      if (!metadata?.url) {
        const existsByHead = await getSignedDownloadUrlByHead(key);
        if (!existsByHead) {
          continue;
        }
      }
      validArtifacts.push({
        key,
        size: typeof metadata?.size === "number" && Number.isFinite(metadata.size) ? metadata.size : 0,
        createdAt: toObjectTimestamp(metadata?.lastModified, Date.now()),
      });
    }

    try {
      return await ctx.runMutation(internal.runs.commitRuntimeArtifacts, {
        runId: args.runId,
        artifacts: validArtifacts,
      });
    } catch (error) {
      for (const artifact of validArtifacts) {
        try {
          await r2.deleteObject(ctx, artifact.key);
        } catch {
          // Best-effort cleanup when artifact billing/indexing fails.
        }
      }
      throw error;
    }
  },
});

export const commitRuntimeArtifacts = internalMutation({
  args: {
    runId: v.id("runs"),
    artifacts: v.array(runtimeArtifactRowValidator),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args): Promise<{ accepted: number }> => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { accepted: 0 };
    }

    const existing = row.artifactKeys || [];
    const seen = new Set(existing);
    const newKeys: string[] = [];
    for (const artifact of args.artifacts) {
      if (!isRunArtifactKey(row.output || "", artifact.key)) {
        continue;
      }
      if (!seen.has(artifact.key)) {
        seen.add(artifact.key);
        newKeys.push(artifact.key);
      }
      try {
        await upsertRunArtifactIndexRow(ctx, {
          userId: row.userId,
          runId: args.runId,
          key: artifact.key,
          size: artifact.size,
          createdAt: artifact.createdAt,
        });
      } catch (error) {
        throw error;
      }
    }
    if (newKeys.length > 0) {
      await ctx.db.patch("runs", args.runId, {
        artifactKeys: [...existing, ...newKeys],
      });
    }
    return { accepted: newKeys.length };
  },
});

export const internalGetRunArtifactCommitContext = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.null(),
    v.object({
      outputPath: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    return {
      outputPath: row.output || "",
    };
  },
});

export const internalGetRunOutputPath = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    return row.output || null;
  },
});
