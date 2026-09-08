import { api, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/_generated/server";
import type { SyncKind } from "@convex/syncManifest";
import { isHostedBillingClientError } from "@convex/cloud/errors";
import { RUN_CONFIG } from "@convex/appConfig";
import {
  COMPUTE_SESSION_STATUS,
  isComputeSessionHeartbeatTimedOut,
  isComputeSessionIdleTimedOut,
} from "@convex/core/computeSessionLifecyclePlan";
import { objectStore } from "@convex/objectStore";

type OwnedEnvironmentRef = {
  dataId: string;
};

type CreateRunStrictArgs = {
  userId: string;
  environmentId: Id<"environments">;
  name?: string;
  gpu_type?: string;
  gpu_count?: number;
  volume_gb?: number;
  computeSessionId?: Id<"computeSessions">;
  warm?: boolean;
  keepWarmAfterMinutes?: number;
};

type CreateServeStrictArgs = {
  userId: string;
  environmentId: Id<"environments">;
  fromRunId?: Id<"runs">;
  fromStoragePrefix?: string;
  modelPath?: string;
  gpuType?: string;
  gpuCount?: number;
  volumeGb?: number;
};

export type GpuRow = {
  id: string;
  display_name: string;
  memory_gb: number;
  max_gpu_count: number;
  price_per_hour: number | null;
};

export function extractBearerToken(request: Request): string {
  const bearer = request.headers.get("authorization")?.trim() || "";
  if (!bearer.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return bearer.slice("bearer ".length).trim();
}

export async function authenticateApiRequest(ctx: ActionCtx, request: Request): Promise<string | null> {
  const apiKey = extractBearerToken(request);
  if (!apiKey) {
    return null;
  }
  const auth = await ctx.runQuery(api.auth.authByApiKey, { apiKey });
  if (!auth) {
    return null;
  }
  const now = Date.now();
  const shouldTouch = typeof auth.lastUsedAt !== "number" || now - auth.lastUsedAt >= 60_000;
  if (shouldTouch) {
    try {
      await ctx.scheduler.runAfter(0, internal.auth.internalTouchApiKeyLastUsed, {
        keyId: auth.keyId,
        at: now,
      });
    } catch {
      // Best effort only. Auth checks must not fail due to usage timestamp contention.
    }
  }

  return auth.userId;
}

export function parseSyncKind(value: unknown): SyncKind | null {
  if (value === "code" || value === "data") {
    return value;
  }
  return null;
}

function normalizeGpuType(value: string) {
  return value.trim().toLowerCase();
}

export async function loadDynamicGpuRows(ctx: ActionCtx, userId: string): Promise<GpuRow[]> {
  const dynamicGpus = await ctx.runAction(internal.catalog.getDynamicGpus, { userId }) as Array<{
    id: string;
    displayName: string;
    memoryInGb: number;
    maxGpuCount: number;
    pricePerHour?: number;
  }>;
  return dynamicGpus
    .map((gpu) => ({
      id: gpu.id,
      display_name: gpu.displayName || gpu.id,
      memory_gb: Number.isFinite(gpu.memoryInGb) ? gpu.memoryInGb : 0,
      max_gpu_count: Number.isFinite(gpu.maxGpuCount) && gpu.maxGpuCount > 0 ? gpu.maxGpuCount : 1,
      price_per_hour:
        typeof gpu.pricePerHour === "number" && Number.isFinite(gpu.pricePerHour) ? gpu.pricePerHour : null,
    }))
    .filter((gpu) => gpu.id);
}

async function loadGpuMaxCounts(ctx: ActionCtx, userId: string) {
  const dynamicGpus = await loadDynamicGpuRows(ctx, userId);
  const out = new Map<string, number>();
  for (const gpu of dynamicGpus) {
    const id = normalizeGpuType(gpu.display_name || "");
    if (!id) continue;
    const max = Number.isFinite(gpu.max_gpu_count) && gpu.max_gpu_count > 0 ? Math.floor(gpu.max_gpu_count) : 1;
    out.set(id, max);
  }
  return out;
}

export async function validateGpuCountLimit(ctx: ActionCtx, userId: string, gpuType: string, gpuCount: number) {
  if (!gpuType.trim() || !Number.isFinite(gpuCount) || gpuCount <= 0) {
    return;
  }
  const maxByType = await loadGpuMaxCounts(ctx, userId);
  if (maxByType.size === 0) {
    return;
  }
  const key = normalizeGpuType(gpuType);
  const max = maxByType.get(key);
  if (typeof max === "undefined") {
    throw new Error(`GPU type ${gpuType} is not available. Run \`tahuna gpus list\`.`);
  }
  if (gpuCount > max) {
    throw new Error(`Max GPU count for ${gpuType} is ${max}.`);
  }
}

export function parseSizeBytes(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const SAFE_CLIENT_ERROR_PATTERNS: RegExp[] = [
  /authentication required/i,
  /access denied/i,
  /not found/i,
  /\bis required\b/i,
  /\bmust be\b/i,
  /\binvalid\b/i,
  /\balready\b/i,
  /\bno gpu capacity currently available\b/i,
  /\binsufficient capacity\b/i,
  /\bmax gpu count\b/i,
  /\bgpu type .* is not available\b/i,
  /\bgpu pricing not configured\b/i,
  /\bno compute provider configured\b/i,
  /\bdisable or replace it in settings\b/i,
  /\benvironment code is not synced\b/i,
  /\benvironment has no serve config configured\b/i,
  /\bexactly one model source is required\b/i,
  /\bsource run must be completed\b/i,
  /\bmodel_path must\b/i,
  /\bsource run has no output artifacts\b/i,
  /\bsource run has no artifacts under the selected model path\b/i,
  /\bstorage prefix has no objects\b/i,
  /\boutput_dir is required\b/i,
  /\bcancel it before deleting\b/i,
  /\bcancellation requested\b/i,
  /\benv var\b.*\b(required|not found|reserved|match)\b/i,
  /\benv_vars\b.*\bis required\b/i,
  /\benv_vars\[\d+\]\.value must be a string\b/i,
  /\bmanifest\b.*\b(not found|invalid|mismatch)\b/i,
  /\bcompute session\b.*\b(not found|mismatch|required|active run|idle)\b/i,
  /\bcompute session\b.*\b(heartbeat|timed out|stale)\b/i,
  /\bno warm compute session is available\b/i,
  /\bwarm compute\b.*\b(expired|stale|not idle)\b/i,
  /\b--keep-warm-minutes cannot be combined with warm compute session assignment\b/i,
  /\bwarm runs use an existing compatible compute session\b/i,
  /\brun\b.*\b(queued|compute session)\b/i,
  /\bblob exceeds limit\b/i,
  /\bmanifest exceeds limit\b/i,
];

export function toClientErrorDetail(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  const line = raw.split("\n")[0]?.trim() || "";
  if (!line) {
    return fallback;
  }
  const stripped = line.replace(/^uncaught\s+(?:\w+\s+)?error:\s*/i, "").trim();
  if (!stripped) {
    return fallback;
  }
  if (SAFE_CLIENT_ERROR_PATTERNS.some((pattern) => pattern.test(stripped)) || isHostedBillingClientError(stripped)) {
    return stripped;
  }
  return fallback;
}

export async function objectExistsWithMetadataSync(
  ctx: ActionCtx,
  key: string,
  attempts?: number,
): Promise<boolean> {
  return await objectStore.objectExists(ctx, key, { attempts });
}

export async function requireAccessibleEnvironment(
  ctx: ActionCtx,
  userId: string,
  environmentId: string,
): Promise<OwnedEnvironmentRef | null> {
  const typedEnvironmentId = environmentId as Id<"environments">;
  try {
    const env = await ctx.runQuery(internal.environments.internalGet, {
      userId,
      environmentId: typedEnvironmentId,
    });
    const dataId = env.data_id.trim();
    return {
      dataId,
    };
  } catch {
    return null;
  }
}

function isNoGpuCapacityError(detail: string) {
  const text = detail.toLowerCase();
  return (
    text.includes("no gpu capacity currently available") ||
    text.includes("no instances currently available") ||
    text.includes("insufficient capacity")
  );
}

function warmComputeExpiredDetail() {
  return "warm compute expired for this environment; start a new warm session with `tahuna train --keep-warm-minutes 10`";
}

export async function createAndProvisionRunStrict(ctx: ActionCtx, args: CreateRunStrictArgs) {
  if (args.keepWarmAfterMinutes && args.keepWarmAfterMinutes > 0) {
    if (args.warm || args.computeSessionId) {
      throw new Error("--keep-warm-minutes cannot be combined with warm compute session assignment");
    }
    const idleTimeoutSeconds = Math.ceil(args.keepWarmAfterMinutes * 60);
    const session = await ctx.runMutation(internal.computeSessions.internalCreate, {
      userId: args.userId,
      environmentId: args.environmentId,
      idleTimeoutSeconds,
      gpuType: args.gpu_type,
      gpuCount: args.gpu_count,
      volumeGb: args.volume_gb,
    });
    const created = await ctx.runMutation(internal.runs.internalCreate, {
      userId: args.userId,
      environmentId: args.environmentId,
      name: args.name,
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
      enqueue_provisioning: false,
      computeSessionId: session.compute_session_id as Id<"computeSessions">,
      assignComputeSession: false,
    });
    const runId = created.run_id as Id<"runs">;
    await ctx.runAction(internal.computeSessions.provisionComputeSession, {
      userId: args.userId,
      computeSessionId: session.compute_session_id as Id<"computeSessions">,
      initialRunId: runId,
    });
    const resolved = await ctx.runQuery(internal.runs.internalGet, {
      userId: args.userId,
      runId,
    });
    if (resolved.status !== "failed") {
      return resolved;
    }

    const detail = resolved.error || "run provisioning failed";
    if (isNoGpuCapacityError(detail)) {
      await ctx.runMutation(internal.runs.internalRemove, {
        userId: args.userId,
        runId,
      });
      await ctx.runMutation(internal.computeSessions.internalRemoveUnprovisioned, {
        userId: args.userId,
        computeSessionId: session.compute_session_id as Id<"computeSessions">,
      });
      throw new Error("no GPU capacity currently available; run was not created");
    }
    throw new Error(detail);
  }
  if (args.warm) {
    if (args.gpu_type || args.gpu_count || args.volume_gb) {
      throw new Error("warm runs use an existing compatible compute session; omit GPU and volume overrides");
    }
    const active = await ctx.runQuery(internal.environments.internalGetActiveComputeSession, {
      userId: args.userId,
      environmentId: args.environmentId,
    });
    if (!active.compute_session_id) {
      throw new Error(warmComputeExpiredDetail());
    }
    let session;
    try {
      session = await ctx.runQuery(internal.computeSessions.internalGet, {
        userId: args.userId,
        computeSessionId: active.compute_session_id as Id<"computeSessions">,
      });
    } catch {
      throw new Error(warmComputeExpiredDetail());
    }
    if (
      session.status === COMPUTE_SESSION_STATUS.TERMINATED ||
      session.status === COMPUTE_SESSION_STATUS.FAILED
    ) {
      throw new Error(warmComputeExpiredDetail());
    }
    if (session.status !== "idle") {
      throw new Error("warm compute is not idle for this environment; wait for the active run to finish");
    }
    if (isComputeSessionHeartbeatTimedOut({
      lastHeartbeatAt: session.last_heartbeat_at,
      heartbeatTimeoutSeconds: RUN_CONFIG.computeSessionHeartbeatTimeoutSeconds,
      startupTimeoutSeconds: RUN_CONFIG.startupTimeoutSeconds,
      nowMs: Date.now(),
    })) {
      await ctx.runAction(internal.computeSessions.internalTerminateTimedOutSession, {
        userId: args.userId,
        environmentId: args.environmentId,
        computeSessionId: session.compute_session_id as Id<"computeSessions">,
        reason: "heartbeat",
      });
      throw new Error(warmComputeExpiredDetail());
    }
    if (isComputeSessionIdleTimedOut({
      lastIdleAt: session.last_idle_at,
      idleTimeoutSeconds: session.idle_timeout_seconds,
      nowMs: Date.now(),
    })) {
      await ctx.runAction(internal.computeSessions.internalTerminateTimedOutSession, {
        userId: args.userId,
        environmentId: args.environmentId,
        computeSessionId: session.compute_session_id as Id<"computeSessions">,
        reason: "idle",
      });
      throw new Error(warmComputeExpiredDetail());
    }
    const created = await ctx.runMutation(internal.runs.internalCreate, {
      userId: args.userId,
      environmentId: args.environmentId,
      name: args.name,
      enqueue_provisioning: false,
      computeSessionId: session.compute_session_id as Id<"computeSessions">,
    });
    return await ctx.runQuery(internal.runs.internalGet, {
      userId: args.userId,
      runId: created.run_id as Id<"runs">,
    });
  }

  if (args.computeSessionId) {
    const created = await ctx.runMutation(internal.runs.internalCreate, {
      userId: args.userId,
      environmentId: args.environmentId,
      name: args.name,
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
      enqueue_provisioning: false,
      computeSessionId: args.computeSessionId,
    });
    return await ctx.runQuery(internal.runs.internalGet, {
      userId: args.userId,
      runId: created.run_id as Id<"runs">,
    });
  }

  const session = await ctx.runMutation(internal.computeSessions.internalCreate, {
    userId: args.userId,
    environmentId: args.environmentId,
    idleTimeoutSeconds: 0,
    gpuType: args.gpu_type,
    gpuCount: args.gpu_count,
    volumeGb: args.volume_gb,
    activateEnvironment: false,
  });
  const computeSessionId = session.compute_session_id as Id<"computeSessions">;
  let runId: Id<"runs">;
  try {
    const created = await ctx.runMutation(internal.runs.internalCreate, {
      userId: args.userId,
      environmentId: args.environmentId,
      name: args.name,
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
      enqueue_provisioning: false,
      computeSessionId,
      executionMode: "ephemeral",
      assignComputeSession: false,
    });
    runId = created.run_id as Id<"runs">;
  } catch (error) {
    await ctx.runMutation(internal.computeSessions.internalRemoveUnprovisioned, {
      userId: args.userId,
      computeSessionId,
    });
    throw error;
  }

  await ctx.runAction(internal.computeSessions.provisionComputeSession, {
    userId: args.userId,
    computeSessionId,
    initialRunId: runId,
  });

  const resolved = await ctx.runQuery(internal.runs.internalGet, {
    userId: args.userId,
    runId,
  });
  if (resolved.status !== "failed") {
    return resolved;
  }

  const detail = resolved.error || "run provisioning failed";
  if (isNoGpuCapacityError(detail)) {
    await ctx.runMutation(internal.runs.internalRemove, {
      userId: args.userId,
      runId,
    });
    await ctx.runMutation(internal.computeSessions.internalRemoveUnprovisioned, {
      userId: args.userId,
      computeSessionId,
    });
    throw new Error("no GPU capacity currently available; run was not created");
  }
  throw new Error(detail);
}

export async function createAndProvisionServeStrict(ctx: ActionCtx, args: CreateServeStrictArgs) {
  const created = await ctx.runAction(internal.serves.internalCreate, {
    userId: args.userId,
    environmentId: args.environmentId,
    fromRunId: args.fromRunId,
    fromStoragePrefix: args.fromStoragePrefix,
    modelPath: args.modelPath,
    gpuType: args.gpuType,
    gpuCount: args.gpuCount,
    volumeGb: args.volumeGb,
    enqueueProvisioning: false,
  });
  const serveId = created.serve_id as Id<"serves">;

  await ctx.runAction(internal.serves.provisionServe, { serveId });

  const resolved = await ctx.runQuery(internal.serves.internalGet, {
    userId: args.userId,
    serveId,
  });
  if (resolved.status !== "failed") {
    return resolved;
  }

  const detail = resolved.error || "serve provisioning failed";
  if (isNoGpuCapacityError(detail)) {
    await ctx.runAction(internal.serves.internalRemove, {
      userId: args.userId,
      serveId,
    });
    throw new Error("no GPU capacity currently available; serve was not created");
  }
  throw new Error(detail);
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}
