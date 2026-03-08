import { api, internal } from "@convex/_generated/api";
import { ActionCtx, httpAction } from "@convex/_generated/server";
import { R2 } from "@convex-dev/r2";
import { components } from "@convex/_generated/api";
import { shortId } from "@convex/ids";

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

function normalizeFilename(filename: unknown) {
  if (typeof filename !== "string") return "file";
  const trimmed = filename.trim();
  return trimmed || "file";
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value.trim() || "file");
}

function dataPrefix(userId: string) {
  return `${userId}/data/`;
}

function environmentPrefix(userId: string) {
  return `${userId}/environment/`;
}

function buildDataKey(userId: string, relativePath: string, filename: string) {
  const blobId = shortId("blob");
  const pathLabel = relativePath.trim() || filename;
  return `${dataPrefix(userId)}${blobId}__${encodePathSegment(pathLabel)}`;
}

function buildCodeKey(userId: string, environmentId: string, filename: string) {
  const artifactId = shortId("code");
  return `${environmentPrefix(userId)}${environmentId}/artifacts/${artifactId}__${encodePathSegment(filename)}`;
}

// Ensure proper CORS for external clients (CLI/web)
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CLIENT_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
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

  try {
    await ctx.runQuery(internal.environments.internalGet, {
      userId,
      environmentId: environmentId as any,
    });
  } catch {
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

  try {
    const filename = normalizeFilename(body?.filename);
    const relativePath =
      typeof body?.relative_path === "string" && body.relative_path.trim() !== ""
        ? body.relative_path
        : filename;
    const key = buildDataKey(userId, relativePath, filename);
    const upload = await r2.generateUploadUrl(key);
    return new Response(JSON.stringify({
      key: upload.key,
      url: upload.url,
      filename,
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

  const allowedPrefixes = [dataPrefix(userId), environmentPrefix(userId)];
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
      environmentId: environmentId as any,
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
      environmentId: environmentId as any,
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
    const data = await ctx.runMutation(internal.runs.internalCreate, {
      userId,
      environmentId: environmentId as any,
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
    return new Response(JSON.stringify({ detail }), {
      status: 400,
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
    const data = await ctx.runMutation(internal.runs.internalCreate, {
      userId,
      environmentId: body?.environment_id as any,
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
    return new Response(JSON.stringify({ detail }), {
      status: 400,
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
        runId: runId as any,
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
      runId: runId as any,
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
      runId: runId as any,
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
