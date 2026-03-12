import { api, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ActionCtx, httpAction, internalQuery } from "@convex/_generated/server";
import { R2 } from "@convex-dev/r2";
import { components } from "@convex/_generated/api";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import {
  AUTH_CONFIG,
  NETWORK_CONFIG,
  RUN_CONFIG,
  SYNC_CONFIG,
  blobLimitByKind,
  manifestLimitByKind,
} from "../config";
import {
  normalizeSha256,
  parseManifest,
  sha256Hex,
  type SyncKind,
  type SyncManifestPayload,
} from "@convex/syncManifest";
import { sleepMs } from "@convex/sleep";

function extractBearerToken(request: Request): string {
  const bearer = request.headers.get("authorization")?.trim() || "";
  if (!bearer.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return bearer.slice("bearer ".length).trim();
}

// Helper to authenticate CLI requests via the API keys
async function authenticateApiRequest(ctx: ActionCtx, request: Request): Promise<string | null> {
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

const r2 = new R2(components.r2);
const RUNTIME_STATUS_VALUES = ["provisioning", "running", "completed", "failed", "cancelled"] as const;
const RUNTIME_STATUS_SET = new Set<string>(RUNTIME_STATUS_VALUES);
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
type CatalogGpuRow = {
  id: string;
  display_name: string;
  memory_gb: number;
  max_gpu_count: number;
  price_per_hour: number | null;
};
type RuntimeStatus = (typeof RUNTIME_STATUS_VALUES)[number];

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

function buildBlobObjectKey(userId: string, sha256: string) {
  return `${blobPrefix(userId)}${sha256}`;
}

function buildManifestObjectKey(
  userId: string,
  environmentId: string,
  dataId: string,
  kind: SyncKind,
  manifestHash: string,
) {
  return `${manifestPrefix(userId, environmentId, dataId, kind)}${manifestHash}.json`;
}

function parseSyncKind(value: unknown): SyncKind | null {
  if (value === "code" || value === "data") {
    return value;
  }
  return null;
}

function normalizeGpuType(value: string) {
  return value.trim().toLowerCase();
}

async function loadDynamicGpuRows(ctx: ActionCtx): Promise<CatalogGpuRow[]> {
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
      price_per_hour: typeof gpu.pricePerHour === "number" && Number.isFinite(gpu.pricePerHour) ? gpu.pricePerHour : null,
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

async function validateGpuCountLimit(ctx: ActionCtx, gpuType: string, gpuCount: number) {
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

function parseSizeBytes(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

async function readJsonBody(request: Request) {
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

async function objectExistsWithMetadataSync(
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

async function requireOwnedEnvironment(
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

async function createAndProvisionRunStrict(ctx: ActionCtx, args: CreateRunStrictArgs) {
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

export const internalGetObjectDownloadUrl = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const metadata = await r2.getMetadata(ctx, args.key);
    return metadata?.url ?? null;
  },
});

async function fetchManifestFromR2(
  _ctx: ActionCtx,
  key: string,
  kind: SyncKind,
  expectedHash: string,
): Promise<SyncManifestPayload> {
  const url = await r2.getUrl(key);
  const response = await fetch(url, { method: "GET" });
  if (response.status === 404) {
    throw new Error(`${kind} manifest not found in object storage`);
  }
  if (!response.ok) {
    throw new Error(`${kind} manifest download failed with status ${response.status}`);
  }
  const rawText = await response.text();
  const computedHash = await sha256Hex(rawText);
  if (computedHash !== expectedHash) {
    throw new Error(`${kind} manifest hash mismatch`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`${kind} manifest is not valid JSON`);
  }
  const manifest = parseManifest(parsed, kind, {
    maxEntrySizeBytes: blobLimitByKind(kind),
  });
  if (!manifest) {
    throw new Error(`${kind} manifest payload is invalid`);
  }
  return manifest;
}

type RuntimeRoute = {
  runId: string;
  action: string;
};

function parseRuntimeRoute(pathname: string): RuntimeRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  // /api/runs/{runId}/runtime/{action}[/{sub}]
  if (parts.length < 5 || parts[0] !== "api" || parts[1] !== "runs" || parts[3] !== "runtime") {
    return null;
  }
  const runId = parts[2];
  const action = parts.slice(4).join("/");
  if (!runId || !action) {
    return null;
  }
  return { runId, action };
}

async function authenticateRuntimeRequest(
  ctx: ActionCtx,
  request: Request,
  runId: Id<"runs">,
): Promise<boolean> {
  const token = extractBearerToken(request);
  if (!token) {
    return false;
  }
  const tokenHash = await sha256Hex(token);
  return await ctx.runQuery(internal.runs.internalValidateRuntimeToken, {
    runId,
    tokenHash,
  });
}

// Ensure proper CORS for external clients (CLI/web)
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export const optionsHandler = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: new Headers(corsHeaders()),
  });
});

export const health = httpAction(async () => {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
});

export const getConfig = httpAction(async () => {
  return new Response(
    JSON.stringify({
      auth: AUTH_CONFIG,
      run: RUN_CONFIG,
      sync: SYNC_CONFIG,
      network: NETWORK_CONFIG,
    }),
    {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    },
  );
});

export const getCatalog = httpAction(async (ctx) => {
  try {
    const data = await ctx.runQuery(api.catalog.getCatalog);
    const gpus = await loadDynamicGpuRows(ctx);
    const fallbackGpus: CatalogGpuRow[] = [
      {
        id: "NVIDIA GeForce RTX 4090",
        display_name: "NVIDIA GeForce RTX 4090",
        memory_gb: 24,
        max_gpu_count: 1,
        price_per_hour: null,
      },
    ];
    const resolved = gpus.length > 0 ? gpus : fallbackGpus;

    return new Response(JSON.stringify({
      ...data,
      gpus: resolved,
      gpu_ids: resolved.map((gpu) => gpu.id),
    }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load catalog";
    return new Response(JSON.stringify({ detail }), {
      status: 500,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

// Data

export const listDataItems = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runQuery(internal.data.internalList, { userId });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to list data items";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const getDataItem = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const dataIdx = parts.findIndex((part) => part === "data");
  const dataId = dataIdx >= 0 ? parts[dataIdx + 1] : "";
  if (!dataId || dataId === "data" || parts[dataIdx + 2]) {
    return new Response(JSON.stringify({ detail: "path must be /api/data/{data_id}" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runQuery(internal.data.internalList, { userId });
    const row = data.blobs.find((blob: { blob_id: string }) => blob.blob_id === dataId);
    if (!row) {
      return new Response(JSON.stringify({ detail: "data item not found" }), {
        status: 404,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    return new Response(JSON.stringify(row), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load data item";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

// Sync

export const listMissingBlobHashes = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const ownedEnvironment = await requireOwnedEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const kind = parseSyncKind(body?.kind);
  if (!kind) {
    return new Response(JSON.stringify({ detail: "kind must be one of: code, data" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (!Array.isArray(body?.hashes)) {
    return new Response(JSON.stringify({ detail: "hashes must be an array" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const seen = new Set<string>();
  const hashes: string[] = [];
  for (const rawHash of body.hashes) {
    const hash = normalizeSha256(rawHash);
    if (!hash) {
      return new Response(JSON.stringify({ detail: "hashes must contain valid sha256 hex values" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    if (!seen.has(hash)) {
      seen.add(hash);
      hashes.push(hash);
    }
  }

  const missingSet = new Set<string>();
  const maxConcurrency = 24;
  let cursor = 0;
  const workers = Math.min(maxConcurrency, Math.max(1, hashes.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= hashes.length) {
          return;
        }
        const hash = hashes[index];
        const key = buildBlobObjectKey(userId, hash);
        const exists = await objectExistsWithMetadataSync(ctx, key, 2);
        if (!exists) {
          missingSet.add(hash);
        }
      }
    }),
  );
  const missing = hashes.filter((hash) => missingSet.has(hash));

  return new Response(JSON.stringify({ missing }), {
    status: 200,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
});

export const createBlobUploadUrl = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const ownedEnvironment = await requireOwnedEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const kind = parseSyncKind(body?.kind);
  if (!kind) {
    return new Response(JSON.stringify({ detail: "kind must be one of: code, data" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const sha256 = normalizeSha256(body?.sha256);
  if (!sha256) {
    return new Response(JSON.stringify({ detail: "sha256 must be a valid sha256 hex value" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const sizeBytes = parseSizeBytes(body?.size_bytes);
  if (sizeBytes === null) {
    return new Response(JSON.stringify({ detail: "size_bytes must be a positive integer" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const maxSizeBytes = blobLimitByKind(kind);
  if (sizeBytes > maxSizeBytes) {
    return new Response(JSON.stringify({ detail: `${kind} blob exceeds limit of ${maxSizeBytes} bytes` }), {
      status: 413,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const key = buildBlobObjectKey(userId, sha256);
    const upload = await r2.generateUploadUrl(key);
    return new Response(JSON.stringify({
      key: upload.key,
      url: upload.url,
      environment_id: environmentId,
      data_id: ownedEnvironment.dataId,
    }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to generate blob upload URL";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const createManifestUploadUrl = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const ownedEnvironment = await requireOwnedEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const kind = parseSyncKind(body?.kind);
  if (!kind) {
    return new Response(JSON.stringify({ detail: "kind must be one of: code, data" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const manifestHash = normalizeSha256(body?.manifest_hash);
  if (!manifestHash) {
    return new Response(JSON.stringify({ detail: "manifest_hash must be a valid sha256 hex value" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const sizeBytes = parseSizeBytes(body?.size_bytes);
  if (sizeBytes === null) {
    return new Response(JSON.stringify({ detail: "size_bytes must be a positive integer" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const maxSizeBytes = manifestLimitByKind(kind);
  if (sizeBytes > maxSizeBytes) {
    return new Response(JSON.stringify({ detail: `${kind} manifest exceeds limit of ${maxSizeBytes} bytes` }), {
      status: 413,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const key = buildManifestObjectKey(userId, environmentId, ownedEnvironment.dataId, kind, manifestHash);
    const upload = await r2.generateUploadUrl(key);
    return new Response(JSON.stringify({
      key: upload.key,
      url: upload.url,
      environment_id: environmentId,
      data_id: ownedEnvironment.dataId,
    }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to generate manifest upload URL";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const commitSync = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const codeManifestHashRaw =
    typeof body?.code_manifest_hash === "string" ? body.code_manifest_hash : undefined;
  const dataManifestHashRaw =
    typeof body?.data_manifest_hash === "string" ? body.data_manifest_hash : undefined;
  // Legacy payload keys (`code_manifest`, `data_manifest`) are tolerated
  // but no longer required. Validation now uses uploaded manifest objects.
  const codeManifestHash =
    typeof codeManifestHashRaw === "undefined" ? undefined : (normalizeSha256(codeManifestHashRaw) ?? undefined);
  const dataManifestHash =
    typeof dataManifestHashRaw === "undefined" ? undefined : (normalizeSha256(dataManifestHashRaw) ?? undefined);

  if (
    (typeof codeManifestHashRaw !== "undefined" && !codeManifestHash) ||
    (typeof dataManifestHashRaw !== "undefined" && !dataManifestHash)
  ) {
    return new Response(JSON.stringify({ detail: "manifest hashes must be valid sha256 hex values" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (!codeManifestHash && !dataManifestHash) {
    return new Response(JSON.stringify({ detail: "at least one of code_manifest_hash or data_manifest_hash is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const typedEnvironmentId = environmentId as Id<"environments">;
  const ownedEnvironment = await requireOwnedEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (codeManifestHash) {
    const codeManifestKey = buildManifestObjectKey(
      userId,
      environmentId,
      ownedEnvironment.dataId,
      "code",
      codeManifestHash,
    );
    const exists = await objectExistsWithMetadataSync(ctx, codeManifestKey);
    if (!exists) {
      return new Response(JSON.stringify({ detail: "code manifest not found in object storage" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    try {
      await fetchManifestFromR2(ctx, codeManifestKey, "code", codeManifestHash);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "code manifest validation failed";
      return new Response(JSON.stringify({ detail }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }
  if (dataManifestHash) {
    const dataManifestKey = buildManifestObjectKey(
      userId,
      environmentId,
      ownedEnvironment.dataId,
      "data",
      dataManifestHash,
    );
    const exists = await objectExistsWithMetadataSync(ctx, dataManifestKey);
    if (!exists) {
      return new Response(JSON.stringify({ detail: "data manifest not found in object storage" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    try {
      await fetchManifestFromR2(ctx, dataManifestKey, "data", dataManifestHash);
    } catch (err) {
      const detail = err instanceof Error ? err.message : "data manifest validation failed";
      return new Response(JSON.stringify({ detail }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }

  try {
    const data = await ctx.runMutation(internal.environments.internalCommitSyncPointers, {
      userId,
      environmentId: typedEnvironmentId,
      code_manifest_hash: codeManifestHash,
      data_manifest_hash: dataManifestHash,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to commit sync pointers";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

// Environments

export const listEnvironments = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const data = await ctx.runQuery(internal.environments.internalList, { userId });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
});

export const createEnvironment = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    const gpuType = body?.gpu_type?.trim() || "";
    const gpuCount = typeof body?.gpu_count === "number" ? body.gpu_count : 0;
    await validateGpuCountLimit(ctx, gpuType, gpuCount);
    const data = await ctx.runMutation(internal.environments.internalCreate, {
      userId,
      name: body?.name?.trim() || "",
      gpu_type: gpuType,
      gpu_count: gpuCount,
      volume_gb: body?.volume_gb ?? 0,
      python_version: body?.python_version?.trim() || undefined,
      framework: body?.framework?.trim() || "",
      version: body?.version?.trim() || "",
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to create environment";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const removeEnvironment = httpAction(async (ctx, request) => {
  const path = new URL(request.url).pathname;
  const parsedDataBindings = parseEnvironmentDataBindingsPath(path);
  if (parsedDataBindings) {
    return handleUnbindEnvironmentData(ctx, request);
  }

  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  // Expected to be called as /api/environments/{env_id} or with search params.
  // The router will map this, but to be flexible:
  let environmentId = url.searchParams.get("env_id")?.trim() || "";
  
  // Also try parsing trailing path
  if (!environmentId) {
    const parts = url.pathname.split("/");
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart !== "environments") {
      environmentId = lastPart;
    }
  }

  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "env_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runMutation(internal.environments.internalRemove, {
      userId,
      environmentId: environmentId as Id<"environments">,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to delete environment";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const getEnvironment = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const environmentId = parts[parts.length - 1];

  if (!environmentId || environmentId === "environments") {
    return new Response(JSON.stringify({ detail: "env_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runQuery(internal.environments.internalGet, {
      userId,
      environmentId: environmentId as Id<"environments">,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load environment";
    return new Response(JSON.stringify({ detail }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const updateEnvironmentSpecs = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const environmentId = parts[parts.length - 1];
  if (!environmentId || environmentId === "environments") {
    return new Response(JSON.stringify({ detail: "env_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const gpuType = typeof body?.gpu_type === "string" ? body.gpu_type.trim() : undefined;
  const gpuCount = typeof body?.gpu_count === "number" ? body.gpu_count : undefined;
  const volumeGb = typeof body?.volume_gb === "number" ? body.volume_gb : undefined;
  if (typeof gpuType === "undefined" && typeof gpuCount === "undefined" && typeof volumeGb === "undefined") {
    return new Response(JSON.stringify({ detail: "at least one of gpu_type, gpu_count, or volume_gb is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    if (typeof gpuCount === "number" && gpuCount > 0) {
      let effectiveGpuType = gpuType || "";
      if (!effectiveGpuType) {
        const current = await ctx.runQuery(internal.environments.internalGet, {
          userId,
          environmentId: environmentId as Id<"environments">,
        });
        effectiveGpuType = current.gpu_type;
      }
      await validateGpuCountLimit(ctx, effectiveGpuType, gpuCount);
    }
    const data = await ctx.runMutation(internal.environments.internalUpdateSpecs, {
      userId,
      environmentId: environmentId as Id<"environments">,
      gpu_type: gpuType,
      gpu_count: gpuCount,
      volume_gb: volumeGb,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to update environment specs";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

function parseEnvironmentDataBindingsPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const envIdx = parts.findIndex((part) => part === "environments");
  const environmentId = envIdx >= 0 ? parts[envIdx + 1] : "";
  const tail = parts[parts.length - 1] || "";
  if (!environmentId || !tail || tail !== "data-bindings") {
    return null;
  }
  return { environmentId };
}

async function handleBindEnvironmentData(ctx: ActionCtx, request: Request) {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const parsed = parseEnvironmentDataBindingsPath(new URL(request.url).pathname);
  if (!parsed) {
    return new Response(JSON.stringify({ detail: "path must be /api/environments/{env_id}/data-bindings" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const raw: unknown[] = Array.isArray(body?.data_ids) ? body.data_ids : [];
  const dataIds = raw
    .filter((value: unknown): value is string => typeof value === "string")
    .map((value: string) => value.trim())
    .filter(Boolean);
  if (dataIds.length === 0) {
    return new Response(JSON.stringify({ detail: "data_ids must contain at least one id" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runMutation(internal.environments.internalBindData, {
      userId,
      environmentId: parsed.environmentId as Id<"environments">,
      data_ids: dataIds,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to bind data";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
}

async function handleUnbindEnvironmentData(ctx: ActionCtx, request: Request) {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const parsed = parseEnvironmentDataBindingsPath(new URL(request.url).pathname);
  if (!parsed) {
    return new Response(JSON.stringify({ detail: "path must be /api/environments/{env_id}/data-bindings" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const raw: unknown[] = Array.isArray(body?.data_ids) ? body.data_ids : [];
  const dataIds = raw
    .filter((value: unknown): value is string => typeof value === "string")
    .map((value: string) => value.trim())
    .filter(Boolean);
  if (dataIds.length === 0) {
    return new Response(JSON.stringify({ detail: "data_ids must contain at least one id" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runMutation(internal.environments.internalUnbindData, {
      userId,
      environmentId: parsed.environmentId as Id<"environments">,
      data_ids: dataIds,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to unbind data";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
}

export const createRunFromEnvironment = httpAction(async (ctx, request) => {
  const path = new URL(request.url).pathname;
  const parsedDataBindings = parseEnvironmentDataBindingsPath(path);
  if (parsedDataBindings) {
    return handleBindEnvironmentData(ctx, request);
  }

  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // Pattern: /api/environments/{env_id}/runs
  const envIdx = parts.findIndex((part) => part === "environments");
  const environmentId = envIdx >= 0 ? parts[envIdx + 1] : "";
  const tail = parts[parts.length - 1];
  if (!environmentId || tail !== "runs") {
    return new Response(JSON.stringify({ detail: "path must be /api/environments/{env_id}/runs" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    const requestedGpuType = typeof body?.gpu_type === "string" ? body.gpu_type.trim() : "";
    const requestedGpuCount = typeof body?.gpu_count === "number" ? body.gpu_count : 0;
    if (requestedGpuCount > 0) {
      let effectiveGpuType = requestedGpuType;
      if (!effectiveGpuType) {
        const current = await ctx.runQuery(internal.environments.internalGet, {
          userId,
          environmentId: environmentId as Id<"environments">,
        });
        effectiveGpuType = current.gpu_type;
      }
      await validateGpuCountLimit(ctx, effectiveGpuType, requestedGpuCount);
    }
    const data = await createAndProvisionRunStrict(ctx, {
      userId,
      environmentId: environmentId as Id<"environments">,
      name: typeof body?.name === "string" ? body.name : undefined,
      gpu_type: body?.gpu_type,
      gpu_count: body?.gpu_count,
      volume_gb: body?.volume_gb,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to create run";
    const status = detail.toLowerCase().includes("no gpu capacity currently available") ? 409 : 400;
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

async function handleRuntimeGet(ctx: ActionCtx, request: Request, route: RuntimeRoute) {
  const runId = route.runId as Id<"runs">;
  const authenticated = await authenticateRuntimeRequest(ctx, request, runId);
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "bootstrap") {
    try {
      const plan = await ctx.runAction(internal.runs.internalGetRuntimeBootstrapPlan, { runId });
      return new Response(JSON.stringify(plan), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "failed to build bootstrap plan";
      return new Response(JSON.stringify({ detail }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
}

async function handleRuntimePost(ctx: ActionCtx, request: Request, route: RuntimeRoute) {
  const runId = route.runId as Id<"runs">;
  const authenticated = await authenticateRuntimeRequest(ctx, request, runId);
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);

  if (route.action === "logs") {
    const candidateLines: unknown[] = Array.isArray(body?.lines) ? (body.lines as unknown[]) : [];
    const lines = candidateLines
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        message: typeof item.message === "string" ? item.message : "",
        level: typeof item.level === "string" ? item.level : undefined,
        source: typeof item.source === "string" ? item.source : undefined,
        timestamp: typeof item.timestamp === "number" ? item.timestamp : undefined,
      }));
    const result = await ctx.runMutation(internal.runs.ingestRuntimeLogs, {
      runId,
      lines,
    });
    return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "metrics") {
    const candidateMetrics: unknown[] = Array.isArray(body?.metrics) ? (body.metrics as unknown[]) : [];
    const metrics: Array<{
      name: string;
      value: number;
      step?: number;
      unit?: string;
      source?: string;
      timestamp?: number;
    }> = [];
    for (const raw of candidateMetrics) {
      if (!raw || typeof raw !== "object") {
        continue;
      }
      const item = raw as Record<string, unknown>;
      const value = typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null;
      if (value === null) {
        continue;
      }
      metrics.push({
        name: typeof item.name === "string" ? item.name : "",
        value,
        step: typeof item.step === "number" ? item.step : undefined,
        unit: typeof item.unit === "string" ? item.unit : undefined,
        source: typeof item.source === "string" ? item.source : undefined,
        timestamp: typeof item.timestamp === "number" ? item.timestamp : undefined,
      });
    }
    const result = await ctx.runMutation(internal.runs.ingestRuntimeMetrics, {
      runId,
      metrics,
    });
    return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "status") {
    const status = typeof body?.status === "string" ? body.status : "";
    const message = typeof body?.message === "string" ? body.message : undefined;
    const error = typeof body?.error === "string" ? body.error : undefined;
    if (!status) {
      return new Response(JSON.stringify({ detail: "status is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    if (!RUNTIME_STATUS_SET.has(status)) {
      return new Response(JSON.stringify({ detail: "invalid status" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    const result = await ctx.runMutation(internal.runs.ingestRuntimeStatus, {
      runId,
      status: status as RuntimeStatus,
      message,
      error,
    });
    return new Response(JSON.stringify({ ok: true, status: result.status }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "artifacts/upload-url") {
    const artifacts: Array<{ name: string; size_bytes: number }> = [];
    const candidateArtifacts: unknown[] = Array.isArray(body?.artifacts) ? (body.artifacts as unknown[]) : [];
    for (const raw of candidateArtifacts) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const sizeBytes = typeof item.size_bytes === "number" && Number.isFinite(item.size_bytes) ? item.size_bytes : 0;
      if (name && sizeBytes > 0) {
        artifacts.push({ name, size_bytes: sizeBytes });
      }
    }
    if (artifacts.length === 0) {
      return new Response(JSON.stringify({ detail: "artifacts array with name and size_bytes is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }

    const outputPath = await ctx.runQuery(internal.runs.internalGetRunOutputPath, { runId });
    if (!outputPath) {
      return new Response(JSON.stringify({ detail: "run not found or has no output path" }), {
        status: 404,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }

    const uploads: Array<{ name: string; key: string; url: string }> = [];
    for (const artifact of artifacts) {
      const safeName = artifact.name.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "_");
      const key = `${outputPath}/${safeName}`;
      try {
        const upload = await r2.generateUploadUrl(key);
        uploads.push({ name: artifact.name, key: upload.key, url: upload.url });
      } catch (err) {
        const detail = err instanceof Error ? err.message : "failed to generate upload URL";
        return new Response(JSON.stringify({ detail: `artifact upload URL failed for ${artifact.name}: ${detail}` }), {
          status: 500,
          headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
        });
      }
    }

    return new Response(JSON.stringify({ uploads }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "artifacts/commit") {
    const candidateKeys: unknown[] = Array.isArray(body?.keys) ? (body.keys as unknown[]) : [];
    const keys: string[] = candidateKeys
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .map((k) => k.trim());
    if (keys.length === 0) {
      return new Response(JSON.stringify({ detail: "keys array is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    const result = await ctx.runMutation(internal.runs.ingestRuntimeArtifacts, { runId, keys });
    return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
}

export const postRunRuntime = httpAction(async (ctx, request) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/cancel")) {
    return handleCancelRun(ctx, request);
  }

  const route = parseRuntimeRoute(new URL(request.url).pathname);
  if (!route) {
    return new Response(JSON.stringify({ detail: "path must be /api/runs/{run_id}/runtime/{action}" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  return handleRuntimePost(ctx, request, route);
});

// Runs

export const listRuns = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const data = await ctx.runQuery(internal.runs.internalList, { userId });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
});

export const createRun = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  try {
    const requestedGpuType = typeof body?.gpu_type === "string" ? body.gpu_type.trim() : "";
    const requestedGpuCount = typeof body?.gpu_count === "number" ? body.gpu_count : 0;
    if (requestedGpuCount > 0) {
      let effectiveGpuType = requestedGpuType;
      if (!effectiveGpuType) {
        const current = await ctx.runQuery(internal.environments.internalGet, {
          userId,
          environmentId: body?.environment_id as Id<"environments">,
        });
        effectiveGpuType = current.gpu_type;
      }
      await validateGpuCountLimit(ctx, effectiveGpuType, requestedGpuCount);
    }
    const data = await createAndProvisionRunStrict(ctx, {
      userId,
      environmentId: body?.environment_id as Id<"environments">,
      name: typeof body?.name === "string" ? body.name : undefined,
      gpu_type: body?.gpu_type,
      gpu_count: body?.gpu_count,
      volume_gb: body?.volume_gb,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to create run";
    const status = detail.toLowerCase().includes("no gpu capacity currently available") ? 409 : 400;
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const renameRun = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const runIdx = parts.findIndex((part) => part === "runs");
  const runId = runIdx >= 0 ? parts[runIdx + 1] : "";
  if (!runId || runId === "runs" || parts[runIdx + 2]) {
    return new Response(JSON.stringify({ detail: "path must be /api/runs/{run_id}" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return new Response(JSON.stringify({ detail: "name is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runMutation(internal.runs.internalRename, {
      userId,
      runId: runId as Id<"runs">,
      name,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to rename run";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const getRunOrLogs = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const runtimeRoute = parseRuntimeRoute(url.pathname);
  if (runtimeRoute) {
    return handleRuntimeGet(ctx, request, runtimeRoute);
  }

  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  // Pattern: /api/runs/{run_id} or /api/runs/{run_id}/logs
  const parts = url.pathname.split("/").filter(Boolean); // remove empty strings

  const isLogs = parts[parts.length - 1] === "logs";
  const runId = isLogs ? parts[parts.length - 2] : parts[parts.length - 1];

  if (!runId || runId === "runs") {
    return new Response(JSON.stringify({ detail: "run_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (isLogs) {
    try {
      const data = await ctx.runQuery(internal.runs.internalGetLogs, {
        userId,
        runId: runId as Id<"runs">,
      });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "failed to load run logs";
      return new Response(JSON.stringify({ detail }), {
        status: 404,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }

  try {
    const data = await ctx.runQuery(internal.runs.internalGet, {
      userId,
      runId: runId as Id<"runs">,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load run";
    return new Response(JSON.stringify({ detail }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const removeRun = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const runId = parts[parts.length - 1];

  if (!runId || runId === "runs") {
    return new Response(JSON.stringify({ detail: "run_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const data = await ctx.runMutation(internal.runs.internalRemove, {
      userId,
      runId: runId as Id<"runs">,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to delete run";
    const status = detail.toLowerCase().includes("cancel it before deleting") ? 409 : 400;
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

async function handleCancelRun(ctx: ActionCtx, request: Request) {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  // /api/runs/{run_id}/cancel
  const runIdx = parts.findIndex((part) => part === "runs");
  const runId = runIdx >= 0 ? parts[runIdx + 1] : "";
  const tail = parts[parts.length - 1];
  if (!runId || tail !== "cancel") {
    return new Response(JSON.stringify({ detail: "path must be /api/runs/{run_id}/cancel" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const force = body?.force === true;

  try {
    const data = await ctx.runMutation(internal.runs.internalCancel, {
      userId,
      runId: runId as Id<"runs">,
      force,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to cancel run";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
}
