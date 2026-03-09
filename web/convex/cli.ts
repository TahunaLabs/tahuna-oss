import { api, internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ActionCtx, httpAction, internalQuery } from "@convex/_generated/server";
import { R2 } from "@convex-dev/r2";
import { components } from "@convex/_generated/api";
import { shortId } from "@convex/ids";
import { v } from "convex/values";

// Helper to authenticate CLI requests via the API keys
async function authenticateApiRequest(ctx: ActionCtx, request: Request): Promise<string | null> {
  const bearer = request.headers.get("authorization")?.trim() || "";
  if (!bearer.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const apiKey = bearer.slice("bearer ".length).trim();
  if (!apiKey) {
    return null;
  }

  const auth = await ctx.runMutation(api.auth.authByApiKey, { apiKey });
  if (!auth) {
    return null;
  }

  return auth.userId;
}

const r2 = new R2(components.r2);
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
type OwnedEnvironmentRef = {
  dataId: string;
};
type CreateRunStrictArgs = {
  userId: string;
  environmentId: Id<"environments">;
  gpu_type?: string;
  gpu_count?: number;
  volume_gb?: number;
};

function normalizeFilename(filename: unknown) {
  if (typeof filename !== "string") return "file";
  const trimmed = filename.trim();
  return trimmed || "file";
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value.trim() || "file");
}

function environmentPrefix(userId: string) {
  return `${userId}/environment/`;
}

function dataRootPrefix(userId: string) {
  return `${userId}/data/`;
}

function dataPrefix(userId: string, dataId: string) {
  return `${dataRootPrefix(userId)}${dataId}/`;
}

function buildDataKey(userId: string, dataId: string, relativePath: string, filename: string) {
  const blobId = shortId("blob");
  const pathLabel = relativePath.trim() || filename;
  return `${dataPrefix(userId, dataId)}files/${blobId}__${encodePathSegment(pathLabel)}`;
}

function buildCodeKey(userId: string, environmentId: string, filename: string) {
  const artifactId = shortId("code");
  return `${environmentPrefix(userId)}${environmentId}/artifacts/${artifactId}__${encodePathSegment(filename)}`;
}

function blobPrefix(userId: string, environmentId: string, dataId: string, kind: SyncKind) {
  if (kind === "data") {
    return `${dataPrefix(userId, dataId)}blobs/`;
  }
  return `${userId}/environment/${environmentId}/blobs/${kind}/`;
}

function manifestPrefix(userId: string, environmentId: string, dataId: string, kind: SyncKind) {
  if (kind === "data") {
    return `${dataPrefix(userId, dataId)}manifests/`;
  }
  return `${userId}/environment/${environmentId}/manifests/${kind}/`;
}

function buildBlobObjectKey(userId: string, environmentId: string, dataId: string, kind: SyncKind, sha256: string) {
  return `${blobPrefix(userId, environmentId, dataId, kind)}${sha256}`;
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

function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(hash)) return null;
  return hash;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function objectExists(ctx: ActionCtx, key: string) {
  try {
    return await ctx.runQuery(internal.cli.internalObjectExists, { key });
  } catch {
    return false;
  }
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

export const internalObjectExists = internalQuery({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const metadata = await r2.getMetadata(ctx, args.key);
    return metadata !== null;
  },
});

export const internalGetObjectDownloadUrl = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const metadata = await r2.getMetadata(ctx, args.key);
    return metadata?.url ?? null;
  },
});

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

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

export const getCatalog = httpAction(async (ctx) => {
  try {
    const data = await ctx.runQuery(api.catalog.getCatalog);
    let dynamicGpus: Array<{ id: string }> = [];
    try {
      dynamicGpus = await ctx.runAction(api.catalog.getDynamicGpus);
    } catch {
      dynamicGpus = [];
    }

    const gpus = dynamicGpus.map((gpu) => gpu.id).filter(Boolean);
    const fallbackGpus = ["NVIDIA GeForce RTX 4090"];

    return new Response(JSON.stringify({
      ...data,
      gpus: gpus.length > 0 ? gpus : fallbackGpus,
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

// Sync

export const createCodeUploadUrl = httpAction(async (ctx, request) => {
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

  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (!(await requireOwnedEnvironment(ctx, userId, environmentId))) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const filename = normalizeFilename(body?.filename);
    const key = buildCodeKey(userId, environmentId, filename);
    const upload = await r2.generateUploadUrl(key);
    return new Response(JSON.stringify({
      key: upload.key,
      url: upload.url,
      filename,
      environment_id: environmentId,
    }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to generate code upload URL";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const createDataUploadUrl = httpAction(async (ctx, request) => {
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

  try {
    const filename = normalizeFilename(body?.filename);
    const relativePath =
      typeof body?.relative_path === "string" && body.relative_path.trim() !== ""
        ? body.relative_path
        : filename;
    const key = buildDataKey(userId, ownedEnvironment.dataId, relativePath, filename);
    const upload = await r2.generateUploadUrl(key);
    return new Response(JSON.stringify({
      key: upload.key,
      url: upload.url,
      filename,
      environment_id: environmentId,
      data_id: ownedEnvironment.dataId,
    }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to generate data upload URL";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

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

  const checks = await Promise.all(
    hashes.map(async (hash) => {
      const key = buildBlobObjectKey(userId, environmentId, ownedEnvironment.dataId, kind, hash);
      const exists = await objectExists(ctx, key);
      return { hash, exists };
    }),
  );
  const missing = checks.filter((item) => !item.exists).map((item) => item.hash);

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

  try {
    const key = buildBlobObjectKey(userId, environmentId, ownedEnvironment.dataId, kind, sha256);
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
  const codeManifestRaw = body?.code_manifest;
  const dataManifestRaw = body?.data_manifest;
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

  const codeManifest =
    typeof codeManifestHash === "undefined" ? undefined : parseManifest(codeManifestRaw, "code");
  const dataManifest =
    typeof dataManifestHash === "undefined" ? undefined : parseManifest(dataManifestRaw, "data");

  if ((typeof codeManifestHash !== "undefined" && !codeManifest) || (typeof dataManifestHash !== "undefined" && !dataManifest)) {
    return new Response(JSON.stringify({ detail: "manifest payload is invalid or missing for provided hash" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (codeManifestHash && codeManifest) {
    const computedHash = await sha256Hex(JSON.stringify(codeManifest));
    if (computedHash !== codeManifestHash) {
      return new Response(JSON.stringify({ detail: "code manifest hash does not match manifest payload" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }
  if (dataManifestHash && dataManifest) {
    const computedHash = await sha256Hex(JSON.stringify(dataManifest));
    if (computedHash !== dataManifestHash) {
      return new Response(JSON.stringify({ detail: "data manifest hash does not match manifest payload" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }

  if (codeManifestHash) {
    const codeManifestKey = buildManifestObjectKey(
      userId,
      environmentId,
      ownedEnvironment.dataId,
      "code",
      codeManifestHash,
    );
    const exists = await objectExists(ctx, codeManifestKey);
    if (!exists) {
      return new Response(JSON.stringify({ detail: "code manifest not found in object storage" }), {
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
    const exists = await objectExists(ctx, dataManifestKey);
    if (!exists) {
      return new Response(JSON.stringify({ detail: "data manifest not found in object storage" }), {
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

export const syncObjectMetadata = httpAction(async (ctx, request) => {
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

  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!key) {
    return new Response(JSON.stringify({ detail: "key is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const allowedPrefixes = [
    environmentPrefix(userId),
    dataRootPrefix(userId),
  ];
  if (!allowedPrefixes.some((prefix) => key.startsWith(prefix))) {
    return new Response(JSON.stringify({ detail: "invalid key prefix" }), {
      status: 403,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    await r2.syncMetadata(ctx, key);
    return new Response(JSON.stringify({ synced: true, key }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to sync metadata";
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
    const data = await ctx.runMutation(internal.environments.internalCreate, {
      userId,
      name: body?.name?.trim() || "",
      gpu_type: body?.gpu_type?.trim() || "",
      gpu_count: body?.gpu_count ?? 0,
      volume_gb: body?.volume_gb ?? 0,
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

export const createRunFromEnvironment = httpAction(async (ctx, request) => {
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
    const data = await createAndProvisionRunStrict(ctx, {
      userId,
      environmentId: environmentId as Id<"environments">,
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
    const data = await createAndProvisionRunStrict(ctx, {
      userId,
      environmentId: body?.environment_id as Id<"environments">,
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

export const getRunOrLogs = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const url = new URL(request.url);
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
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});
