import { ConvexError, v } from "convex/values";
import { components, internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { R2 } from "@convex-dev/r2";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { images } from "@convex/catalog";
import { PYTHON_CONFIG, RUN_CONFIG, SYNC_CONFIG } from "@convex/appConfig";
import { applyStorageDeltaCredits, USAGE_EVENT_TYPE, upsertLedgerDebitTotal } from "@convex/credits";
import type { ComputeSettlementResult } from "@convex/runBilling";
import {
  estimateRunUsageFromHourlyRateCents,
  resolveRunHourlyRateCents,
  resolveTerminalRunTiming,
  settleRunComputeCharge,
  toUnixMillis,
} from "@convex/runBilling";
import { getAccessibleRun } from "@convex/runsAccess";
import { listByUserId, toRunLogsOnlyResponse, toRunLogsResponse, toRunMetricsOnlyResponse, toRunResponse } from "@convex/runsRead";
import {
  cancelRunForUserId,
  createRunForUserId,
  deleteRunDataBatch,
  deleteRunForUserId,
  renameRunForUserId,
  scheduleForcedPodTermination,
} from "@convex/runsLifecycle";
import {
  parseManifest,
  sha256Hex,
  type ManifestEntry,
  type SyncKind,
  type SyncManifestPayload,
} from "@convex/syncManifest";
import { sleepMs } from "@convex/sleep";
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
  code: v.object({
    manifest_hash: v.string(),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
  data: v.object({
    manifest_hash: v.union(v.string(), v.null()),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
});

const r2 = new R2(components.r2);

type RuntimeBootstrapEntry = ManifestEntry & { download_url: string };
type ProvisioningPayload = {
  run_id: string;
  environment_id: string;
  user_id: string;
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
  return {
    run_id: String(row._id),
    environment_id: String(row.environmentId),
    user_id: row.userId,
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

async function fetchObjectBytes(_ctx: ActionCtx, key: string): Promise<ArrayBuffer> {
  const downloadUrl = await r2.getUrl(key);
  const response = await fetch(downloadUrl);
  if (response.status === 404) {
    throw new Error(`object not found: ${key}`);
  }
  if (!response.ok) {
    throw new Error(`failed to fetch object ${key}: http ${response.status}`);
  }
  return await response.arrayBuffer();
}

async function fetchManifest(
  ctx: ActionCtx,
  kind: SyncKind,
  key: string,
  expectedHash: string,
) {
  const rawBytes = await fetchObjectBytes(ctx, key);
  const rawText = new TextDecoder().decode(rawBytes);
  const actualHash = await sha256Hex(rawText);
  if (actualHash !== expectedHash) {
    throw new Error(`${kind} manifest hash mismatch`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`${kind} manifest is not valid JSON`);
  }
  const manifest = parseManifest(parsed, kind);
  if (!manifest) {
    throw new Error(`${kind} manifest payload is invalid`);
  }
  return manifest;
}

function blobKeys(
  _kind: SyncKind,
  sha256: string,
) {
  return [`blobs/${sha256}`];
}

function summarizeManifest(manifest: SyncManifestPayload) {
  return {
    fileCount: manifest.entries.length,
    totalBytes: manifest.entries.reduce((sum, entry) => sum + entry.size, 0),
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

async function getDownloadUrlWithMetadataSync(ctx: ActionCtx, key: string): Promise<string | null> {
  const immediate = await r2.getMetadata(ctx, key);
  if (immediate?.url) {
    return immediate.url;
  }
  const direct = await getSignedDownloadUrlByHead(key);
  if (direct) {
    return direct;
  }
  let delay = SYNC_CONFIG.objectMetadataPollInitialBackoffMs;
  for (let attempt = 0; attempt < SYNC_CONFIG.objectMetadataPollAttempts; attempt += 1) {
    const metadata = await r2.getMetadata(ctx, key);
    if (metadata?.url) {
      return metadata.url;
    }
    const signedUrl = await getSignedDownloadUrlByHead(key);
    if (signedUrl) {
      return signedUrl;
    }
    if (attempt < SYNC_CONFIG.objectMetadataPollAttempts - 1) {
      await sleepMs(delay);
      if (delay < SYNC_CONFIG.objectMetadataPollMaxBackoffMs) {
        delay *= 2;
      }
    }
  }
  return null;
}

async function resolveManifestDownloadEntries(
  ctx: ActionCtx,
  kind: SyncKind,
  manifest: SyncManifestPayload,
): Promise<RuntimeBootstrapEntry[]> {
  const entries: RuntimeBootstrapEntry[] = [];
  const keyUrlCache = new Map<string, string | null>();
  for (const entry of manifest.entries) {
    const candidateKeys = blobKeys(kind, entry.sha256);
    let downloadUrl: string | null = null;
    for (const key of candidateKeys) {
      if (keyUrlCache.has(key)) {
        downloadUrl = keyUrlCache.get(key) || null;
      } else {
        const quickMetadata = await r2.getMetadata(ctx, key);
        if (quickMetadata?.url) {
          downloadUrl = quickMetadata.url;
        } else {
          downloadUrl = await getSignedDownloadUrlByHead(key);
        }
        keyUrlCache.set(key, downloadUrl);
      }
      if (downloadUrl) {
        break;
      }
    }
    if (!downloadUrl) {
      for (const key of candidateKeys) {
        downloadUrl = await getDownloadUrlWithMetadataSync(ctx, key);
        if (downloadUrl) {
          keyUrlCache.set(key, downloadUrl);
          break;
        }
      }
    }
    if (!downloadUrl) {
      throw new Error(`${kind} blob is missing from object storage: ${entry.sha256}`);
    }
    entries.push({
      ...entry,
      download_url: downloadUrl,
    });
  }
  return entries;
}

function resolveImageName(framework: string, version: string, pythonVersion: string) {
  const frameworkImages = images[framework];
  if (!frameworkImages) {
    throw new Error(`unsupported framework for provisioning: ${framework}`);
  }
  const versionImages = frameworkImages[version];
  if (!versionImages) {
    throw new Error(`unsupported framework version for provisioning: ${framework}:${version}`);
  }
  const imageName = versionImages[pythonVersion];
  if (!imageName) {
    throw new Error(`unsupported python version for provisioning: ${framework}:${version}:${pythonVersion}`);
  }
  return imageName;
}

function resolveRuntimeApiBase() {
  // Prefer public Tahuna URLs for pod runtime callbacks.
  // Localhost app URLs are often unreachable from remote pods.
  const candidates = [
    process.env.TAHUNA_SITE_URL,
    process.env.NEXT_PUBLIC_TAHUNA_SITE_URL,
    process.env.TAHUNA_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    process.env.CONVEX_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed && !trimmed.includes("localhost") && !trimmed.includes("127.0.0.1")) {
      return trimmed.replace(/\/+$/, "");
    }
  }
  // Fallback: allow localhost if nothing else is available (local dev testing)
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed) {
      return trimmed.replace(/\/+$/, "");
    }
  }
  throw new Error("TAHUNA_SITE_URL (or SITE_URL) is required for pod runtime callbacks");
}

function resolveWandbBaseURL(runtimeApiBase: string) {
  return `${runtimeApiBase}/api/monitoring/wandb`;
}

function generateRuntimeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function runtimeEntrypoint() {
  return "/usr/local/bin/warden";
}

async function createRunpodPod(args: {
  runId: string;
  imageName: string;
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
  runtimeToken: string;
  payload: ProvisioningPayload;
}) {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RUNPOD_API_KEY is not set");
  }
  const cloudType = (process.env.RUNPOD_CLOUD_TYPE?.trim().toUpperCase() || "SECURE");
  const allowedCloudType = cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE";
  const gpuTypeId = await resolveRunpodGpuTypeId(apiKey, args.gpuType);
  const runtimeApiBase = resolveRuntimeApiBase();
  const wandbBaseURL = resolveWandbBaseURL(runtimeApiBase);
  const runtimeRequestTimeoutSeconds = process.env.TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS?.trim() || "120";

  const response = await fetch("https://rest.runpod.io/v1/pods", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `tahuna-${args.runId}`,
      computeType: "GPU",
      cloudType: allowedCloudType,
      gpuCount: Math.max(1, args.gpuCount),
      gpuTypeIds: [gpuTypeId],
      gpuTypePriority: "custom",
      imageName: args.imageName,
      volumeInGb: Math.max(1, args.volumeGb),
      volumeMountPath: "/workspace",
      env: {
        TAHUNA_RUN_ID: args.payload.run_id,
        TAHUNA_ENVIRONMENT_ID: args.payload.environment_id,
        TAHUNA_CONTRACT_VERSION: args.payload.contract_version,
        TAHUNA_INPUT_PATH: args.payload.input_path,
        TAHUNA_OUTPUT_PATH: args.payload.output_path,
        TAHUNA_LOGS_PATH: args.payload.logs_path,
        TAHUNA_CODE_MANIFEST_HASH: args.payload.code_manifest_hash || "",
        TAHUNA_DATA_MANIFEST_HASH: args.payload.data_manifest_hash || "",
        TAHUNA_CODE_MANIFEST_KEY: args.payload.code_manifest_key || "",
        TAHUNA_DATA_MANIFEST_KEY: args.payload.data_manifest_key || "",
        TAHUNA_API_BASE: runtimeApiBase,
        TAHUNA_RUNTIME_TOKEN: args.runtimeToken,
        TAHUNA_WORKSPACE_ROOT: "/workspace",
        TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS: runtimeRequestTimeoutSeconds,
        TAHUNA_CANCELLATION_GRACE_SECONDS: String(RUN_CONFIG.cancellationGraceSeconds),
        WANDB_BASE_URL: wandbBaseURL,
      },
      dockerEntrypoint: [runtimeEntrypoint()],
      ports: ["22/tcp", "8888/http"],
    }),
  });
  const rawText = await response.text();
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "message" in body && typeof (body as Record<string, unknown>).message === "string"
        ? String((body as Record<string, unknown>).message)
        : (rawText.trim() || `http ${response.status}`);
    throw new Error(`Runpod pod creation failed: ${detail}`);
  }
  const row = (body || {}) as Record<string, unknown>;
  const podId = typeof row.id === "string" ? row.id : (typeof row.podId === "string" ? row.podId : "");
  if (!podId) {
    throw new Error("Runpod pod creation failed: missing pod id in response");
  }
  return {
    podId,
    rawResponse: row,
  };
}

async function terminateRunpodPod(podId: string) {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  if (!podId) {
    return;
  }
  if (!apiKey) {
    throw new Error("RUNPOD_API_KEY is not set; cannot terminate pod");
  }
  const response = await fetch(`https://rest.runpod.io/v1/pods/${podId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (response.status === 404) {
    // Already gone.
    return;
  }
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || `Runpod pod termination failed: http ${response.status}`);
  }
}

function normalizeGpuLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveRunpodGpuTypeId(apiKey: string, requestedGpu: string) {
  const trimmed = requestedGpu.trim();
  if (!trimmed) {
    throw new Error("GPU type is empty");
  }
  const res = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: "query { gpuTypes { id displayName } }",
    }),
  });
  if (!res.ok) {
    throw new Error(`failed to fetch Runpod GPU catalog: http ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("failed to parse Runpod GPU catalog response");
  }
  const typesRaw =
    json && typeof json === "object" && "data" in json
      ? (json as { data?: { gpuTypes?: Array<{ id?: string; displayName?: string }> } }).data?.gpuTypes
      : undefined;
  const gpuTypes = Array.isArray(typesRaw) ? typesRaw : [];
  if (gpuTypes.length === 0) {
    throw new Error("Runpod GPU catalog is empty");
  }

  const requestedNorm = normalizeGpuLabel(trimmed);
  const directMatch = gpuTypes.find((gpu) => typeof gpu.id === "string" && gpu.id === trimmed);
  if (directMatch?.id) {
    return directMatch.id;
  }
  const displayMatch = gpuTypes.find(
    (gpu) => typeof gpu.displayName === "string" && normalizeGpuLabel(gpu.displayName) === requestedNorm,
  );
  if (displayMatch?.id) {
    return displayMatch.id;
  }

  const sample = gpuTypes
    .slice(0, 10)
    .map((gpu) => gpu.displayName || gpu.id || "")
    .filter(Boolean)
    .join(", ");
  throw new Error(`Runpod GPU type not found: "${trimmed}". Available examples: ${sample}`);
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
          idempotencyKey: `run:${runId}:live_debit`,
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
  args: { runId: v.id("runs"), podId: v.string(), force: v.optional(v.boolean()), attempt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const shouldTerminate = await ctx.runQuery(internal.runs.internalShouldTerminatePod, {
      runId: args.runId,
      force: args.force === true,
    });
    if (!shouldTerminate) {
      return;
    }
    const attempt = args.attempt ?? 0;
    try {
      await terminateRunpodPod(args.podId);
      await ctx.runMutation(internal.runs.markCancelledAfterTermination, {
        runId: args.runId,
        force: args.force === true,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "failed to terminate pod";
      const nextAttempt = attempt + 1;
      if (nextAttempt < RUN_CONFIG.terminationRetryMaxAttempts) {
        await ctx.runMutation(internal.runs.scheduleTerminationRetry, {
          runId: args.runId,
          podId: args.podId,
          force: args.force === true,
          attempt: nextAttempt,
          error: detail,
        });
        return;
      }
      await ctx.runMutation(internal.runs.markCancellationTerminationFailed, {
        runId: args.runId,
        error: `${detail} (retries exhausted)`,
      });
    }
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
    return {
      run_id: String(row._id),
      effective_gpu_type: row.effectiveGpuType || env.gpuType,
      effective_gpu_count: row.effectiveGpuCount || env.gpuCount,
      effective_volume_gb: row.effectiveVolumeGb || env.volumeGb,
      framework: env.framework,
      version: env.version,
      python_version: env.pythonVersion || PYTHON_CONFIG.defaultVersion,
    };
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

    const codeManifest = await fetchManifest(ctx, "code", codeManifestKey, codeManifestHash);
    const codeEntries = await resolveManifestDownloadEntries(ctx, "code", codeManifest);
    let dataEntries: RuntimeBootstrapEntry[] = [];
    if (dataManifestHash && dataManifestKey) {
      const dataManifest = await fetchManifest(ctx, "data", dataManifestKey, dataManifestHash);
      dataEntries = await resolveManifestDownloadEntries(ctx, "data", dataManifest);
    }

    return {
      run_id: provisioningPayload.run_id,
      contract_version: provisioningPayload.contract_version,
      workspace_root: "/workspace",
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
    try {
      const codeManifestHash = provisioningPayload.code_manifest_hash;
      const dataManifestHash = provisioningPayload.data_manifest_hash;
      const codeManifestKey = provisioningPayload.code_manifest_key;
      const dataManifestKey = provisioningPayload.data_manifest_key;
      if (!codeManifestHash || !codeManifestKey) {
        throw new Error("missing pinned code manifest hash/key in provisioning payload");
      }

      const codeManifest = await fetchManifest(ctx, "code", codeManifestKey, codeManifestHash);
      const codeStats = summarizeManifest(codeManifest);
      let dataStats = { fileCount: 0, totalBytes: 0 };
      if (dataManifestHash && dataManifestKey) {
        const dataManifest = await fetchManifest(ctx, "data", dataManifestKey, dataManifestHash);
        dataStats = summarizeManifest(dataManifest);
      }
      const runtimeToken = generateRuntimeToken();
      const runtimeTokenHash = await sha256Hex(runtimeToken);
      await ctx.runMutation(internal.runs.setRuntimeTokenHash, {
        runId: args.runId,
        runtimeTokenHash,
      });
      if (await ctx.runQuery(internal.runs.internalShouldAbortProvisioning, { runId: args.runId })) {
        return null;
      }
      const imageName = resolveImageName(runSpec.framework, runSpec.version, runSpec.python_version);
      const provisionResult = await createRunpodPod({
        runId: String(args.runId),
        imageName,
        gpuType: runSpec.effective_gpu_type,
        gpuCount: runSpec.effective_gpu_count,
        volumeGb: runSpec.effective_volume_gb,
        runtimeToken,
        payload: provisioningPayload,
      });
      await ctx.runMutation(internal.runs.markPodProvisioned, {
        runId: args.runId,
        podId: provisionResult.podId,
        runpodResponse: provisionResult.rawResponse,
      });

      await ctx.runMutation(internal.runs.markRunning, {
        runId: args.runId,
        provisioningPayload: {
          ...provisioningPayload,
          bootstrap_summary: {
            code_files: codeStats.fileCount,
            code_bytes: codeStats.totalBytes,
            data_files: dataStats.fileCount,
            data_bytes: dataStats.totalBytes,
          },
          runpod_pod_id: provisionResult.podId,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "pod bootstrap failed";
      await ctx.runMutation(internal.runs.markFailed, {
        runId: args.runId,
        error: `pod bootstrap failed: ${detail}`,
        provisioningPayload,
      });
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
    await scheduleForcedPodTermination(ctx, args.runId, row.podId);
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
      await scheduleForcedPodTermination(ctx, args.runId, row.podId);
      return { status: RUN_STATUS.FAILED };
    }

    const patch: {
      status: string;
      runtimeTokenHash?: string;
      computeEndedAt?: number;
      computeChargeCents?: number;
      computeCollectedCents?: number;
      computeOutstandingCents?: number;
      computeChargeStatus?: "charged" | "owed";
      computeChargeError?: string;
    } = { status };
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
      await scheduleForcedPodTermination(ctx, args.runId, row.podId);
    }
    return { status };
  },
});

export const ingestRuntimeArtifacts = internalMutation({
  args: {
    runId: v.id("runs"),
    keys: v.array(v.string()),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      return { accepted: 0 };
    }
    const outputPath = row.output || "";
    const validArtifacts: Array<{ key: string; size: number; createdAt: number }> = [];
    const inputSeen = new Set<string>();
    for (const rawKey of args.keys) {
      const key = rawKey.trim();
      if (!key || inputSeen.has(key)) {
        continue;
      }
      inputSeen.add(key);
      if (!isRunArtifactKey(outputPath, key)) {
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

    const existing = row.artifactKeys || [];
    const seen = new Set(existing);
    const newKeys: string[] = [];
    for (const artifact of validArtifacts) {
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
        try {
          await r2.deleteObject(ctx, artifact.key);
        } catch {
          // Best-effort cleanup when artifact billing/indexing fails.
        }
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
