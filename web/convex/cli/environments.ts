import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { type ActionCtx, httpAction } from "@convex/_generated/server";
import {
  authenticateApiRequest,
  corsHeaders,
  createAndProvisionRunStrict,
  readJsonBody,
  toClientErrorDetail,
  validateGpuCountLimit,
} from "@convex/cli/shared";

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
    await validateGpuCountLimit(ctx, userId, gpuType, gpuCount);
    const command = Array.isArray(body?.command)
      ? body.command.filter((p: unknown) => typeof p === "string" && p.trim() !== "")
      : [];
    const outputDir = typeof body?.output_dir === "string" && body.output_dir.trim() !== ""
      ? body.output_dir.trim()
      : "outputs";
    const data = await ctx.runMutation(internal.environments.internalCreate, {
      userId,
      name: body?.name?.trim() || "",
      gpu_type: gpuType,
      gpu_count: gpuCount,
      volume_gb: body?.volume_gb ?? 0,
      python_version: body?.python_version?.trim() || undefined,
      framework: body?.framework?.trim() || "",
      version: body?.version?.trim() || "",
      command,
      output_dir: outputDir,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to create environment");
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
    const detail = toClientErrorDetail(err, "failed to delete environment");
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
    const detail = toClientErrorDetail(err, "failed to load environment");
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
  const pythonVersion = typeof body?.python_version === "string" ? body.python_version.trim() : undefined;
  const framework = typeof body?.framework === "string" ? body.framework.trim() : undefined;
  const frameworkVersion = typeof body?.framework_version === "string" ? body.framework_version.trim() : undefined;

  const hasHardwareUpdate = typeof gpuType !== "undefined" || typeof gpuCount !== "undefined" || typeof volumeGb !== "undefined";
  const hasRuntimeUpdate = typeof pythonVersion !== "undefined" || typeof framework !== "undefined" || typeof frameworkVersion !== "undefined";

  if (!hasHardwareUpdate && !hasRuntimeUpdate) {
    return new Response(
      JSON.stringify({ detail: "at least one update field is required" }),
      {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      },
    );
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
      await validateGpuCountLimit(ctx, userId, effectiveGpuType, gpuCount);
    }
    const data = await ctx.runMutation(internal.environments.internalUpdateSpecs, {
      userId,
      environmentId: environmentId as Id<"environments">,
      gpu_type: gpuType,
      gpu_count: gpuCount,
      volume_gb: volumeGb,
      python_version: pythonVersion,
      framework: framework,
      version: frameworkVersion,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to update environment specs");
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
    const detail = toClientErrorDetail(err, "failed to bind data");
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
    const detail = toClientErrorDetail(err, "failed to unbind data");
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
      await validateGpuCountLimit(ctx, userId, effectiveGpuType, requestedGpuCount);
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
    const detail = toClientErrorDetail(err, "failed to create run");
    const lower = detail.toLowerCase();
    const status = lower.includes("no gpu capacity currently available")
      ? 409
      : lower.includes("insufficient credits")
        ? 402
        : 400;
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});
