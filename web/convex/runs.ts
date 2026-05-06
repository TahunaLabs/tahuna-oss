import { ConvexError, v } from "convex/values";
import { internal } from "@convex/_generated/api";
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
import {
  buildRuntimeCompatibilityKey,
  classifyRuntimeIncompatibility,
  normalizeProvisioningError,
  type RuntimeCompatibilityFingerprint,
} from "@/lib/runtime-incompatibility";
import { PYTHON_CONFIG, RUN_CONFIG } from "@convex/appConfig";
import { applyStorageDeltaCredits } from "@convex/cloud/storageUsage";
import { resolveConfiguredDependencyGroup } from "@/lib/dependency-selection";
import {
  buildProvisionedRuntimeEnv,
  resolveEnvironmentEnvVarsForEnvironmentId,
} from "@convex/envVars";
import {
  createCleanupFailedUploadJob,
  createFinalizeArtifactJob,
  createTerminateMachineJob,
} from "@convex/core/jobQueue";
import {
  completeActionJob,
  enqueueCleanupFailedUploadJob,
  enqueueRunDataDeletionBatch,
  enqueueTerminateMachineJob,
  failActionJob,
  markCoreJobCompleted,
  markCoreJobFailed,
  startActionJob,
  upsertCoreJobRecord,
} from "@convex/convexJobQueue";
import {
  applyHostedRunLifecyclePlan as applyRunLifecyclePlan,
  cancelHostedRunForUserId as cancelRunForUserId,
  createHostedRunForUserId as createRunForUserId,
  deleteHostedRunForUserId as deleteRunForUserId,
} from "@convex/cloud/runLifecycleComposition";
import {
  isRunArtifactKey,
  planCancellationTerminationCompleted,
  planCancellationTerminationFailed,
  planMachineProvisioned,
  planMachineRunning,
  planProvisioningStarted,
  planRunFailure,
  planRuntimeArtifactCommit,
  planRuntimeStatusIngestion,
  planTerminationRetry,
  sanitizeRuntimeMessage,
  shouldAbortProvisioning,
  shouldEnforceStartupTimeout,
  shouldTerminateMachine,
  type RunLifecycleStatus,
} from "@convex/core/runLifecyclePlan";
import { getAccessibleRun } from "@convex/runsAccess";
import { listByUserId, toRunLogsOnlyResponse, toRunLogsResponse, toRunMetricsOnlyResponse, toRunResponse } from "@convex/runsRead";
import { storageKeys } from "@convex/core/storage";
import { objectStore } from "@convex/objectStore";
import { resolveComputeCompatibilityCloudType } from "@convex/computeProvider";
import {
  fetchSyncManifest,
  resolveSyncManifestDownloadEntries,
  type RuntimeBootstrapEntry,
} from "@convex/runtimeBootstrap";
import {
  deleteRunDataBatch,
  renameRunForUserId,
  toRunLifecycleState,
} from "@convex/runsLifecycle";
import {
  provisionRuntimeMachine,
  resolveImageName,
  resolveWandbBaseURL,
  terminateRuntimeMachineWithRetry,
} from "@convex/runtimeProvisioning";
import { RUN_STATUS, TERMINAL_STATUSES } from "@convex/runsConstants";
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
  provider_machine_id: v.string(),
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
const coreJobTypeValidator = v.union(
  v.literal("provision_run"),
  v.literal("check_startup_timeout"),
  v.literal("terminate_machine"),
  v.literal("finalize_artifact"),
  v.literal("cleanup_failed_upload"),
  v.literal("provision_serve"),
  v.literal("check_serve_startup_timeout"),
  v.literal("terminate_serve_machine"),
  v.literal("delete_serve_data"),
);
const coreJobStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);
const coreJobRecordInputValidator = v.object({
  type: coreJobTypeValidator,
  idempotencyKey: v.string(),
  delayMs: v.number(),
  payload: v.any(),
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
  provider_machine_id: v.optional(v.string()),
});
const runProvisionSpecValidator = v.object({
  run_id: v.string(),
  provider_credential_id: v.string(),
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
    providerMachineId: v.optional(v.string()),
  }),
);

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
  provider_machine_id?: string;
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
  return trimmed || "machine";
}

function normalizeRuntimeTimestamp(timestamp: number | undefined) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
    return Math.floor(timestamp);
  }
  return Date.now();
}

function manifestObjectKey(
  environmentId: Id<"environments">,
  dataId: string | undefined,
  kind: "code" | "data",
  manifestHash?: string,
) {
  if (!manifestHash) {
    return null;
  }
  return storageKeys.manifestObjectKey(String(environmentId), dataId || String(environmentId), kind, manifestHash);
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
    code_manifest_key: manifestObjectKey(row.environmentId, row.dataId, "code", row.codeManifestHash),
    data_manifest_key: manifestObjectKey(row.environmentId, row.dataId, "data", row.dataManifestHash),
    contract_version: "sync-incremental-0.1.0",
  };
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

export const recordRunJob = internalMutation({
  args: {
    job: coreJobRecordInputValidator,
    status: coreJobStatusValidator,
  },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    const { jobId } = await upsertCoreJobRecord(ctx, args.job, args.status);
    return jobId;
  },
});

export const completeRunJob = internalMutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markCoreJobCompleted(ctx, args.jobId);
    return null;
  },
});

export const failRunJob = internalMutation({
  args: { jobId: v.id("jobs"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markCoreJobFailed(ctx, args.jobId, args.error);
    return null;
  },
});

export const internalDeleteRunData = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasMore = await deleteRunDataBatch(ctx, args.runId);
    if (hasMore) {
      await enqueueRunDataDeletionBatch(ctx, args.runId);
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
    if (!row) {
      return null;
    }
    await applyRunLifecyclePlan(ctx, args.runId, row, planCancellationTerminationCompleted({
      run: toRunLifecycleState(row),
      force: args.force === true,
    }));
    return null;
  },
});

export const markCancellationTerminationFailed = internalMutation({
  args: { runId: v.id("runs"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    await applyRunLifecyclePlan(ctx, args.runId, row, planCancellationTerminationFailed({
      run: toRunLifecycleState(row),
      error: args.error,
    }));
    return null;
  },
});

export const scheduleTerminationRetry = internalMutation({
  args: {
    runId: v.id("runs"),
    providerMachineId: v.string(),
    providerCredentialId: v.optional(v.string()),
    force: v.optional(v.boolean()),
    attempt: v.number(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    await applyRunLifecyclePlan(ctx, args.runId, row, planTerminationRetry({
      run: toRunLifecycleState(row),
      providerMachineId: args.providerMachineId,
      providerCredentialId: args.providerCredentialId ? String(args.providerCredentialId) : undefined,
      force: args.force === true,
      attempt: args.attempt,
      maxAttempts: RUN_CONFIG.terminationRetryMaxAttempts,
      delayMs: RUN_CONFIG.terminationRetryDelaySeconds * 1000,
      error: args.error,
    }));
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

export const internalTerminateMachine = internalAction({
  args: {
    runId: v.id("runs"),
    providerMachineId: v.string(),
    providerCredentialId: v.optional(v.string()),
    force: v.optional(v.boolean()),
    attempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await terminateRuntimeMachineWithRetry({
      ctx,
      providerMachineId: args.providerMachineId,
      providerCredentialId: args.providerCredentialId ?? null,
      attempt: args.attempt ?? 0,
      shouldTerminate: async () =>
        await ctx.runQuery(internal.runs.internalShouldTerminateMachine, {
          runId: args.runId,
          force: args.force === true,
        }),
      resolveProviderCredentialId: async () =>
        await ctx.runQuery(internal.runs.internalGetProviderCredentialId, { runId: args.runId }),
      onTerminated: async () => {
        await ctx.runMutation(internal.runs.markCancelledAfterTermination, {
          runId: args.runId,
          force: args.force === true,
        });
      },
      onRetry: async ({ nextAttempt, providerCredentialId, error }) => {
        if (nextAttempt < RUN_CONFIG.terminationRetryMaxAttempts) {
          await ctx.runMutation(internal.runs.scheduleTerminationRetry, {
            runId: args.runId,
            providerMachineId: args.providerMachineId,
            providerCredentialId,
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
    if (!row.providerCredentialId) {
      throw new ConvexError("run is missing its compute provider credential");
    }
    return {
      run_id: String(row._id),
      provider_credential_id: row.providerCredentialId,
      effective_gpu_type: row.effectiveGpuType || env.gpuType,
      effective_gpu_count: row.effectiveGpuCount || env.gpuCount,
      effective_volume_gb: row.effectiveVolumeGb || env.volumeGb,
      framework: env.framework,
      version: env.version,
      python_version: env.pythonVersion || PYTHON_CONFIG.defaultVersion,
    };
  },
});

export const internalGetProviderCredentialId = internalQuery({
  args: { runId: v.id("runs") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    return row?.providerCredentialId ?? null;
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
    return shouldAbortProvisioning(row ? toRunLifecycleState(row) : null);
  },
});

export const internalShouldTerminateMachine = internalQuery({
  args: { runId: v.id("runs"), force: v.optional(v.boolean()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    return shouldTerminateMachine({
      run: row ? toRunLifecycleState(row) : null,
      force: args.force === true,
    });
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
      providerMachineId: row.providerMachineId,
    };
  },
});

export const upsertRuntimeIncompatibility = internalMutation({
  args: {
    runId: v.id("runs"),
    providerMachineId: v.optional(v.string()),
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
        lastProviderMachineId: args.providerMachineId?.trim() || existing.lastProviderMachineId,
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
      lastProviderMachineId: args.providerMachineId?.trim() || undefined,
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
    providerMachineId: v.string(),
    providerCredentialId: v.string(),
    fingerprint: runtimeCompatibilityFingerprintValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.runQuery(internal.runs.internalGetStartupTimeoutState, {
      runId: args.runId,
    });
    if (!shouldEnforceStartupTimeout({ state, providerMachineId: args.providerMachineId })) {
      return null;
    }
    const detail = `startup timeout: timed out waiting for runtime startup heartbeat after ${RUN_CONFIG.startupTimeoutSeconds}s`;
    const incompatibility = classifyRuntimeIncompatibility(detail);
    if (incompatibility) {
      await ctx.runMutation(internal.runs.upsertRuntimeIncompatibility, {
        runId: args.runId,
        providerMachineId: args.providerMachineId,
        fingerprint: args.fingerprint,
        errorCode: incompatibility.code,
        errorDetail: detail,
        cooldownSeconds: incompatibility.cooldownSeconds,
      });
    }
    await ctx.runMutation(internal.runs.markFailed, {
      runId: args.runId,
      error: `runtime bootstrap failed: ${detail}`,
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
      cloudType: resolveComputeCompatibilityCloudType(),
      framework: runSpec.framework,
      version: runSpec.version,
      pythonVersion: runSpec.python_version,
      gpuType: runSpec.effective_gpu_type,
      imageName: resolveImageName(runSpec.framework, runSpec.version, runSpec.python_version),
    });
    let provisionedProviderMachineId = "";
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
      const provisionResult = await provisionRuntimeMachine({
        ctx,
        shouldAbort: async () =>
          await ctx.runQuery(internal.runs.internalShouldAbortProvisioning, { runId: args.runId }),
        setRuntimeTokenHash: async (runtimeTokenHash) => {
          await ctx.runMutation(internal.runs.setRuntimeTokenHash, {
            runId: args.runId,
            runtimeTokenHash,
          });
        },
        createMachine: {
          name: `tahuna-${String(args.runId)}`,
          providerCredentialId: runSpec.provider_credential_id,
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
      provisionedProviderMachineId = provisionResult.providerMachineId;
      await ctx.runMutation(internal.runs.markMachineProvisioned, {
        runId: args.runId,
        providerMachineId: provisionResult.providerMachineId,
        providerCredentialId: runSpec.provider_credential_id,
        fingerprint: compatibilityFingerprint,
        providerMetadata: provisionResult.providerMetadata,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "runtime bootstrap failed";
      const detail = normalizeProvisioningError(raw);
      const incompatibility = classifyRuntimeIncompatibility(detail);
      if (incompatibility) {
        await ctx.runMutation(internal.runs.upsertRuntimeIncompatibility, {
          runId: args.runId,
          providerMachineId: provisionedProviderMachineId || undefined,
          fingerprint: compatibilityFingerprint,
          errorCode: incompatibility.code,
          errorDetail: detail,
          cooldownSeconds: incompatibility.cooldownSeconds,
        });
      }
      await ctx.runMutation(internal.runs.markFailed, {
        runId: args.runId,
        error: `runtime bootstrap failed: ${detail}`,
        provisioningPayload,
      });
      if (provisionedProviderMachineId) {
        await enqueueTerminateMachineJob(ctx, createTerminateMachineJob({
          runId: String(args.runId),
          providerMachineId: provisionedProviderMachineId,
          providerCredentialId: runSpec.provider_credential_id,
          force: true,
        }));
      }
    }
    return null;
  },
});

export const markMachineProvisioned = internalMutation({
  args: {
    runId: v.id("runs"),
    providerMachineId: v.string(),
    providerCredentialId: v.string(),
    fingerprint: runtimeCompatibilityFingerprintValidator,
    providerMetadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    await applyRunLifecyclePlan(ctx, args.runId, row, planMachineProvisioned({
      run: toRunLifecycleState(row),
      providerMachineId: args.providerMachineId,
      providerMetadata: args.providerMetadata,
      startupTimeout: {
        delayMs: RUN_CONFIG.startupTimeoutSeconds * 1000,
        providerCredentialId: String(args.providerCredentialId),
        fingerprint: normalizeCompatibilityFingerprint(args.fingerprint as RuntimeCompatibilityFingerprint),
      },
    }));
    return null;
  },
});

export const markProvisioning = internalMutation({
  args: { runId: v.id("runs"), provisioningPayload: v.optional(provisioningPayloadValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    await applyRunLifecyclePlan(ctx, args.runId, row, planProvisioningStarted({
      run: toRunLifecycleState(row),
      provisioningPayload: args.provisioningPayload,
    }));
    return null;
  },
});

export const markRunning = internalMutation({
  args: { runId: v.id("runs"), provisioningPayload: v.optional(provisioningPayloadValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return null;
    }
    await applyRunLifecyclePlan(ctx, args.runId, row, planMachineRunning({
      run: toRunLifecycleState(row),
      provisioningPayload: args.provisioningPayload,
      nowMs: Date.now(),
    }));
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
    if (!row) {
      return null;
    }
    await applyRunLifecyclePlan(ctx, args.runId, row, planRunFailure({
      run: toRunLifecycleState(row),
      error: args.error,
      provisioningPayload: args.provisioningPayload,
    }));
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
    const plan = planRuntimeStatusIngestion({
      run: toRunLifecycleState(row),
      status: args.status as RunLifecycleStatus,
      message: args.message,
      error: args.error,
      nowMs: Date.now(),
    });
    await applyRunLifecyclePlan(ctx, args.runId, row, plan);
    return { status: plan.resultStatus };
  },
});

export const ingestRuntimeArtifacts = internalAction({
  args: {
    runId: v.id("runs"),
    keys: v.array(v.string()),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args): Promise<{ accepted: number }> => {
    const job = createFinalizeArtifactJob({ runId: String(args.runId), keys: args.keys });
    const jobId = await startActionJob(ctx, job);
    const validArtifacts: Array<{ key: string; size: number; createdAt: number }> = [];
    try {
      const commitContext = await ctx.runQuery(internal.runs.internalGetRunArtifactCommitContext, {
        runId: args.runId,
      });
      if (!commitContext) {
        await completeActionJob(ctx, jobId);
        return { accepted: 0 };
      }
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
        const metadata = await objectStore.getMetadata(ctx, key);
        if (!metadata?.url) {
          const signedDownload = await objectStore.getSignedDownload(ctx, key);
          if (!signedDownload) {
            continue;
          }
        }
        validArtifacts.push({
          key,
          size: typeof metadata?.size === "number" && Number.isFinite(metadata.size) ? metadata.size : 0,
          createdAt: toObjectTimestamp(metadata?.lastModified, Date.now()),
        });
      }

      const result = await ctx.runMutation(internal.runs.commitRuntimeArtifacts, {
        runId: args.runId,
        artifacts: validArtifacts,
      });
      await completeActionJob(ctx, jobId);
      return result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "artifact finalization failed";
      for (const artifact of validArtifacts) {
        try {
          await enqueueCleanupFailedUploadJob(ctx, createCleanupFailedUploadJob({
            runId: String(args.runId),
            key: artifact.key,
            reason: detail,
          }));
        } catch {
          // Best-effort cleanup scheduling when artifact finalization fails.
        }
      }
      await failActionJob(ctx, jobId, detail);
      throw error;
    }
  },
});

export const cleanupFailedArtifactUpload = internalAction({
  args: {
    runId: v.id("runs"),
    key: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const jobId = await startActionJob(ctx, createCleanupFailedUploadJob({
      runId: String(args.runId),
      key: args.key,
      reason: args.reason,
    }));
    try {
      await objectStore.deleteObject(ctx, args.key);
      await completeActionJob(ctx, jobId);
    } catch (error) {
      await failActionJob(
        ctx,
        jobId,
        error instanceof Error ? error.message : "failed to clean up artifact upload",
      );
    }
    return null;
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

    const plan = planRuntimeArtifactCommit({
      outputPath: row.output || "",
      existingArtifactKeys: row.artifactKeys || [],
      artifacts: args.artifacts,
    });
    for (const artifact of plan.acceptedArtifacts) {
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
    if (plan.patch) {
      await ctx.db.patch("runs", args.runId, plan.patch);
    }
    return { accepted: plan.acceptedCount };
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
