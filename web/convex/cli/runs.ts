import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { httpAction } from "@convex/_generated/server";
import {
  authenticateApiRequest,
  corsHeaders,
  createAndProvisionRunStrict,
  readJsonBody,
  validateGpuCountLimit,
} from "@convex/cli/shared";
import { handleCancelRun, handleRuntimeGet, handleRuntimePost, parseRuntimeRoute } from "@convex/runsHttp";

export const postRunRuntime = httpAction(async (ctx, request) => {
  const pathname = new URL(request.url).pathname;
  if (pathname.endsWith("/cancel")) {
    return handleCancelRun(ctx, request, authenticateApiRequest);
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
  const cancelActive = url.searchParams.get("cancel") === "1" || url.searchParams.get("cancel") === "true";
  const forceDelete = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";

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
      cancelActive,
      force: forceDelete,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to delete run";
    const lower = detail.toLowerCase();
    const status =
      lower.includes("cancel it before deleting") || lower.includes("cancellation requested") ? 409 : 400;
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});
