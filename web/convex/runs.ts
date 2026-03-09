import { Workpool } from "@convex-dev/workpool";
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
  type QueryCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { images } from "./catalog";

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const runResponseValidator = v.object({
  run_id: v.string(),
  created_at: v.number(),
  env_id: v.string(),
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
});
const listRunsResponseValidator = v.object({
  runs: v.array(runResponseValidator),
});
const runLogsResponseValidator = v.object({
  run_id: v.string(),
  logs_path: v.string(),
  log_file: v.string(),
  note: v.string(),
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
});

const provisionPool = new Workpool(components.workpool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
});
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

type SyncKind = "code" | "data";
type ManifestEntry = {
  path: string;
  sha256: string;
  size: number;
  mode: number;
};
type SyncManifestPayload = {
  version: number;
  type: SyncKind;
  created_at: number;
  entries: ManifestEntry[];
};

function toRunResponse(row: Doc<"runs">) {
  return {
    run_id: String(row._id),
    created_at: row._creationTime,
    env_id: String(row.environmentId),
    input: row.input,
    output: row.output,
    logs: row.logs,
    status: row.status,
    error: row.error || "",
    pod_id: row.podId || "",
    effective_gpu_type: row.effectiveGpuType || "",
    effective_gpu_count: row.effectiveGpuCount || 0,
    effective_volume_gb: row.effectiveVolumeGb || 0,
    code_manifest_hash: row.codeManifestHash || "",
    data_manifest_hash: row.dataManifestHash || "",
    cancellation_requested: row.cancellationRequested,
  };
}

function manifestKey(
  userId: string,
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
    return `${userId}/data/${resolvedDataId}/manifests/${manifestHash}.json`;
  }
  return `${userId}/environment/${environmentId}/manifests/${kind}/${manifestHash}.json`;
}

function toProvisioningPayload(row: Doc<"runs">) {
  return {
    run_id: String(row._id),
    environment_id: String(row.environmentId),
    user_id: row.userId,
    input_path: row.input,
    output_path: row.output,
    logs_path: row.logs,
    code_manifest_hash: row.codeManifestHash ?? null,
    data_manifest_hash: row.dataManifestHash ?? null,
    code_manifest_key: manifestKey(row.userId, row.environmentId, row.dataId, "code", row.codeManifestHash),
    data_manifest_key: manifestKey(row.userId, row.environmentId, row.dataId, "data", row.dataManifestHash),
    contract_version: "sync-incremental-0.1.0",
  };
}

function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(hash)) return null;
  return hash;
}

function parseManifestEntry(value: unknown): ManifestEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const path = typeof row.path === "string" ? row.path.trim() : "";
  const sha256 = normalizeSha256(row.sha256);
  const size = typeof row.size === "number" ? row.size : NaN;
  const mode = typeof row.mode === "number" ? row.mode : NaN;
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    return null;
  }
  if (path === "." || path === ".." || path.includes("/../") || path.startsWith("../")) {
    return null;
  }
  if (!sha256 || !Number.isFinite(size) || size < 0 || !Number.isInteger(size)) {
    return null;
  }
  if (!Number.isFinite(mode) || mode < 0 || mode > 0o777 || !Number.isInteger(mode)) {
    return null;
  }
  return { path, sha256, size, mode };
}

function parseManifest(value: unknown, kind: SyncKind): SyncManifestPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const version = row.version;
  const type = row.type;
  const createdAt = row.created_at;
  const entries = row.entries;
  if (version !== 1 || type !== kind || typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return null;
  }
  if (!Array.isArray(entries)) {
    return null;
  }
  const parsedEntries: ManifestEntry[] = [];
  let previousPath = "";
  for (const entry of entries) {
    const parsed = parseManifestEntry(entry);
    if (!parsed) {
      return null;
    }
    if (previousPath !== "" && parsed.path < previousPath) {
      return null;
    }
    previousPath = parsed.path;
    parsedEntries.push(parsed);
  }
  return {
    version: 1,
    type: kind,
    created_at: createdAt,
    entries: parsedEntries,
  };
}

async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchObjectBytes(ctx: ActionCtx, key: string): Promise<ArrayBuffer> {
  const downloadUrl = await ctx.runQuery(internal.cli.internalGetObjectDownloadUrl, { key });
  if (!downloadUrl) {
    throw new Error(`object not found: ${key}`);
  }
  const response = await fetch(downloadUrl);
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

function blobKey(
  payload: {
    user_id: string;
    environment_id: string;
    data_manifest_key: string | null;
  },
  kind: SyncKind,
  sha256: string,
) {
  if (kind === "code") {
    return `${payload.user_id}/environment/${payload.environment_id}/blobs/code/${sha256}`;
  }
  const dataKey = payload.data_manifest_key;
  if (!dataKey) {
    throw new Error("data manifest key is missing");
  }
  const marker = "/manifests/";
  const markerIndex = dataKey.indexOf(marker);
  if (markerIndex <= 0) {
    throw new Error("invalid data manifest key");
  }
  return `${dataKey.slice(0, markerIndex)}/blobs/${sha256}`;
}

async function fetchAndVerifyManifestBlobs(
  ctx: ActionCtx,
  payload: {
    user_id: string;
    environment_id: string;
    data_manifest_key: string | null;
  },
  kind: SyncKind,
  manifest: SyncManifestPayload,
) {
  let totalBytes = 0;
  for (const entry of manifest.entries) {
    const key = blobKey(payload, kind, entry.sha256);
    const bytes = await fetchObjectBytes(ctx, key);
    if (bytes.byteLength !== entry.size) {
      throw new Error(`${kind} blob size mismatch for ${entry.path}`);
    }
    const actualHash = await sha256Hex(bytes);
    if (actualHash !== entry.sha256) {
      throw new Error(`${kind} blob hash mismatch for ${entry.path}`);
    }
    totalBytes += bytes.byteLength;
  }
  return {
    fileCount: manifest.entries.length,
    totalBytes,
  };
}

function resolveImageName(framework: string, version: string) {
  const frameworkImages = images[framework];
  if (!frameworkImages) {
    throw new Error(`unsupported framework for provisioning: ${framework}`);
  }
  const imageName = frameworkImages[version];
  if (!imageName) {
    throw new Error(`unsupported framework version for provisioning: ${framework}:${version}`);
  }
  return imageName;
}

async function createRunpodPod(args: {
  runId: string;
  imageName: string;
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
  payload: {
    run_id: string;
    environment_id: string;
    input_path: string;
    output_path: string;
    logs_path: string;
    code_manifest_hash: string | null;
    data_manifest_hash: string | null;
    code_manifest_key: string | null;
    data_manifest_key: string | null;
    contract_version: string;
  };
}) {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("RUNPOD_API_KEY is not set");
  }
  const cloudType = (process.env.RUNPOD_CLOUD_TYPE?.trim().toUpperCase() || "SECURE");
  const allowedCloudType = cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE";
  const gpuTypeId = await resolveRunpodGpuTypeId(apiKey, args.gpuType);

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
      },
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

async function listByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return {
    runs: rows.sort((a, b) => b._creationTime - a._creationTime).map(toRunResponse),
  };
}

async function getOwnedRun(ctx: QueryCtx | MutationCtx, userId: string, runId: Id<"runs">) {
  const row = await ctx.db.get("runs", runId);
  if (!row || row.userId !== userId) {
    throw new ConvexError("run not found");
  }
  return row;
}

async function getOwnedEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
) {
  const env = await ctx.db.get("environments", environmentId);
  if (!env || env.userId !== userId) {
    throw new ConvexError("environment not found");
  }
  return env;
}

async function createRunForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
    enqueue_provisioning?: boolean;
  },
) {
  const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
  const codeManifestHash = env.latestCodeManifestHash;
  const dataManifestHash = env.latestDataManifestHash;
  const dataId = env.dataId || String(env._id);
  if (!codeManifestHash || !dataManifestHash) {
    throw new ConvexError("environment is not synced; run `tahuna sync` before creating a run");
  }

  const now = Date.now();
  const runId = await ctx.db.insert("runs", {
    userId: args.userId,
    environmentId: args.environmentId,
    dataId,
    input: `runs/${args.environmentId}/${now}/input`,
    output: `runs/${args.environmentId}/${now}/output`,
    logs: `runs/${args.environmentId}/${now}/logs`,
    status: "provisioning",
    cancellationRequested: false,
    effectiveGpuType: args.gpu_type ?? env.gpuType,
    effectiveGpuCount: args.gpu_count ?? env.gpuCount,
    effectiveVolumeGb: args.volume_gb ?? env.volumeGb,
    codeManifestHash: codeManifestHash,
    dataManifestHash: dataManifestHash,
  });

  await ctx.db.insert("runEvents", {
    runId,
    status: "provisioning",
    message: "run submitted for provisioning",
    metadata: {
      gpu_type: args.gpu_type || env.gpuType,
      gpu_count: args.gpu_count ?? env.gpuCount,
      volume_gb: args.volume_gb ?? env.volumeGb,
      code_manifest_hash: codeManifestHash || null,
      data_manifest_hash: dataManifestHash || null,
    },
  });

  if (args.enqueue_provisioning ?? true) {
    await provisionPool.enqueueAction(ctx, internal.runs.provisionRun, { runId });
  }
  const row = await ctx.db.get("runs", runId);
  if (!row) {
    throw new ConvexError("failed to create run");
  }
  return toRunResponse(row);
}

async function removeRunForUserId(ctx: MutationCtx, userId: string, runId: Id<"runs">) {
  const row = await getOwnedRun(ctx, userId, runId);

  if (ACTIVE_STATUSES.has(row.status)) {
    await ctx.db.patch("runs", runId, {
      status: "cancelling",
      cancellationRequested: true,
    });
    await ctx.db.insert("runEvents", {
      runId,
      status: "cancelling",
      message: "cancellation requested",
    });
    return { cancel_requested: true, run_id: String(runId) };
  }

  await ctx.db.delete("runs", runId);
  return { deleted: true, run_id: String(runId) };
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
    const row = await getOwnedRun(ctx, String(user._id), args.runId);
    return toRunResponse(row);
  },
});

export const getLogs = query({
  args: { runId: v.id("runs") },
  returns: runLogsResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedRun(ctx, String(user._id), args.runId);
    return {
      run_id: String(row._id),
      logs_path: row.logs,
      log_file: `${row.logs}/run.log`,
      note: "Logs are uploaded by the training pod into object storage.",
    };
  },
});

export const internalGetLogs = internalQuery({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: runLogsResponseValidator,
  handler: async (ctx, args) => {
    const row = await getOwnedRun(ctx, args.userId, args.runId);
    return {
      run_id: String(row._id),
      logs_path: row.logs,
      log_file: `${row.logs}/run.log`,
      note: "Logs are uploaded by the training pod into object storage.",
    };
  },
});

export const create = mutation({
  args: {
    environmentId: v.id("environments"),
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
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
    });
  },
});

export const remove = mutation({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.object({ cancel_requested: v.boolean(), run_id: v.string() }),
    v.object({ deleted: v.boolean(), run_id: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return removeRunForUserId(ctx, String(user._id), args.runId);
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
    const row = await getOwnedRun(ctx, args.userId, args.runId);
    return toRunResponse(row);
  },
});

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
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
  args: { userId: v.string(), runId: v.id("runs") },
  returns: v.union(
    v.object({ cancel_requested: v.boolean(), run_id: v.string() }),
    v.object({ deleted: v.boolean(), run_id: v.string() }),
  ),
  handler: async (ctx, args) => {
    return removeRunForUserId(ctx, args.userId, args.runId);
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
    };
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
    try {
      const codeManifestHash = provisioningPayload.code_manifest_hash;
      const dataManifestHash = provisioningPayload.data_manifest_hash;
      const codeManifestKey = provisioningPayload.code_manifest_key;
      const dataManifestKey = provisioningPayload.data_manifest_key;
      if (!codeManifestHash || !dataManifestHash || !codeManifestKey || !dataManifestKey) {
        throw new Error("missing pinned manifest hash/key in provisioning payload");
      }

      const codeManifest = await fetchManifest(ctx, "code", codeManifestKey, codeManifestHash);
      const dataManifest = await fetchManifest(ctx, "data", dataManifestKey, dataManifestHash);
      const codeStats = await fetchAndVerifyManifestBlobs(ctx, provisioningPayload, "code", codeManifest);
      const dataStats = await fetchAndVerifyManifestBlobs(ctx, provisioningPayload, "data", dataManifest);
      const imageName = resolveImageName(runSpec.framework, runSpec.version);
      const provisionResult = await createRunpodPod({
        runId: String(args.runId),
        imageName,
        gpuType: runSpec.effective_gpu_type,
        gpuCount: runSpec.effective_gpu_count,
        volumeGb: runSpec.effective_volume_gb,
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
      status: "provisioning",
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
        await ctx.db.patch("runs", args.runId, { status: "cancelled" });
      }
      return null;
    }
    await ctx.db.patch("runs", args.runId, { status: "provisioning" });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: "provisioning",
      message: "pod bootstrap started",
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
            fetch_strategy: "download pinned code/data manifests from R2 and verify referenced blobs",
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
        await ctx.db.patch("runs", args.runId, { status: "cancelled" });
      }
      return null;
    }

    await ctx.db.patch("runs", args.runId, {
      status: "running",
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: "running",
      message: "pod running",
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
            fetch_strategy: "pod fetched code/data manifests from R2 by pinned manifest hash",
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
    await ctx.db.patch("runs", args.runId, {
      status: "failed",
      error: errorText,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: "failed",
      message: errorText,
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
          }
        : undefined,
    });
    return null;
  },
});

export const completeRun = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }

    const terminal = row.cancellationRequested ? "cancelled" : "completed";
    await ctx.db.patch("runs", args.runId, {
      status: terminal,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: terminal,
      message: terminal === "completed" ? "run completed" : "run cancelled",
    });
    return null;
  },
});
