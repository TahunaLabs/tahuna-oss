import { api, components, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/_generated/server";
import { R2 } from "@convex-dev/r2";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { SYNC_CONFIG } from "@convex/appConfig";
import type { SyncKind } from "@convex/syncManifest";
import { sleepMs } from "@convex/sleep";

export const r2 = new R2(components.r2);

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
};

export type CatalogGpuRow = {
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

function dataRootPrefix(userId: string) {
  return `${userId}/data/`;
}

function dataPrefix(userId: string, dataId: string) {
  return `${dataRootPrefix(userId)}${dataId}/`;
}

function blobPrefix(userId: string) {
  return `${userId}/blobs/`;
}

function manifestPrefix(userId: string, environmentId: string, dataId: string, kind: SyncKind) {
  if (kind === "data") {
    return `${dataPrefix(userId, dataId)}manifests/`;
  }
  return `${userId}/environment/${environmentId}/manifests/${kind}/`;
}

export function buildBlobObjectKey(userId: string, sha256: string) {
  return `${blobPrefix(userId)}${sha256}`;
}

export function buildManifestObjectKey(
  userId: string,
  environmentId: string,
  dataId: string,
  kind: SyncKind,
  manifestHash: string,
) {
  return `${manifestPrefix(userId, environmentId, dataId, kind)}${manifestHash}.json`;
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

export async function loadDynamicGpuRows(ctx: ActionCtx): Promise<CatalogGpuRow[]> {
  let dynamicGpus: Array<{
    id: string;
    displayName: string;
    memoryInGb: number;
    maxGpuCount: number;
    pricePerHour?: number;
  }> = [];
  try {
    dynamicGpus = await ctx.runAction(api.catalog.getDynamicGpus);
  } catch {
    dynamicGpus = [];
  }
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

async function loadGpuMaxCounts(ctx: ActionCtx) {
  const dynamicGpus = await loadDynamicGpuRows(ctx);
  const out = new Map<string, number>();
  for (const gpu of dynamicGpus) {
    const id = normalizeGpuType(gpu.id || "");
    if (!id) continue;
    const max = Number.isFinite(gpu.max_gpu_count) && gpu.max_gpu_count > 0 ? Math.floor(gpu.max_gpu_count) : 1;
    out.set(id, max);
  }
  return out;
}

export async function validateGpuCountLimit(ctx: ActionCtx, gpuType: string, gpuCount: number) {
  if (!gpuType.trim() || !Number.isFinite(gpuCount) || gpuCount <= 0) {
    return;
  }
  const maxByType = await loadGpuMaxCounts(ctx);
  if (maxByType.size === 0) {
    return;
  }
  const key = normalizeGpuType(gpuType);
  const max = maxByType.get(key);
  if (typeof max === "undefined") {
    throw new Error(`GPU type ${gpuType} is not available. Run \`tahuna catalog gpus\`.`);
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

function isS3NotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const row = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return row.name === "NotFound" || row.Code === "NotFound" || row.$metadata?.httpStatusCode === 404;
}

async function objectExistsInR2(key: string): Promise<boolean> {
  try {
    await r2.client.send(
      new HeadObjectCommand({
        Bucket: r2.config.bucket,
        Key: key,
      }),
    );
    return true;
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return false;
    }
    throw error;
  }
}

export async function objectExistsWithMetadataSync(
  ctx: ActionCtx,
  key: string,
  attempts: number = SYNC_CONFIG.objectMetadataPollAttempts,
): Promise<boolean> {
  const immediate = await r2.getMetadata(ctx, key);
  if (immediate?.url) {
    return true;
  }

  let delay = SYNC_CONFIG.objectMetadataPollInitialBackoffMs;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const exists = await objectExistsInR2(key);
      if (exists) {
        return true;
      }
    } catch {
      // Transient object-store errors are handled by retry loop.
    }
    const metadata = await r2.getMetadata(ctx, key);
    if (metadata) {
      return true;
    }
    if (attempt < attempts - 1) {
      await sleepMs(delay);
      if (delay < SYNC_CONFIG.objectMetadataPollMaxBackoffMs) {
        delay *= 2;
      }
    }
  }
  return false;
}

export async function requireOwnedEnvironment(
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
    const dataId = typeof env?.data_id === "string" && env.data_id.trim() ? env.data_id.trim() : environmentId;
    return {
      dataId,
    };
  } catch {
    return null;
  }
}

function isNoGpuCapacityError(detail: string) {
  const text = detail.toLowerCase();
  return text.includes("no instances currently available") || text.includes("insufficient capacity");
}

export async function createAndProvisionRunStrict(ctx: ActionCtx, args: CreateRunStrictArgs) {
  const created = await ctx.runMutation(internal.runs.internalCreate, {
    ...args,
    enqueue_provisioning: false,
  });
  const runId = created.run_id as Id<"runs">;

  await ctx.runAction(internal.runs.provisionRun, { runId });

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
    throw new Error("no GPU capacity currently available; run was not created");
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
