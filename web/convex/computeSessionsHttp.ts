import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { httpAction, type ActionCtx } from "@convex/_generated/server";
import { corsHeaders, extractBearerToken, readJsonBody } from "@convex/cli/shared";
import { sha256Hex } from "@convex/syncManifest";

export type ComputeSessionRuntimeRoute = {
  computeSessionId: string;
  action: string;
};

export function parseComputeSessionRuntimeRoute(pathname: string): ComputeSessionRuntimeRoute | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 5 || parts[0] !== "api" || parts[1] !== "compute_sessions" || parts[3] !== "runtime") {
    return null;
  }
  const computeSessionId = parts[2];
  const action = parts.slice(4).join("/");
  if (!computeSessionId || !action) {
    return null;
  }
  return { computeSessionId, action };
}

async function authenticateComputeSessionRuntimeRequest(
  ctx: ActionCtx,
  request: Request,
  computeSessionId: Id<"computeSessions">,
) {
  const token = extractBearerToken(request);
  if (!token) {
    return false;
  }
  const tokenHash = await sha256Hex(token);
  return await ctx.runQuery(internal.computeSessions.internalValidateRuntimeToken, {
    computeSessionId,
    tokenHash,
  });
}

export async function handleComputeSessionRuntimeGet(
  ctx: ActionCtx,
  request: Request,
  route: ComputeSessionRuntimeRoute,
) {
  const computeSessionId = route.computeSessionId as Id<"computeSessions">;
  const authenticated = await authenticateComputeSessionRuntimeRequest(ctx, request, computeSessionId);
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "assignment") {
    await ctx.runMutation(internal.computeSessions.internalHeartbeat, { computeSessionId });
    await ctx.runMutation(internal.computeSessions.internalMarkIdleIfActiveRunTerminal, { computeSessionId });
    const assignment = await ctx.runQuery(internal.computeSessions.internalGetRuntimeAssignment, {
      computeSessionId,
    });
    return new Response(JSON.stringify(assignment), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
}

export async function handleComputeSessionRuntimePost(
  ctx: ActionCtx,
  request: Request,
  route: ComputeSessionRuntimeRoute,
) {
  const computeSessionId = route.computeSessionId as Id<"computeSessions">;
  const authenticated = await authenticateComputeSessionRuntimeRequest(ctx, request, computeSessionId);
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "heartbeat") {
    await ctx.runMutation(internal.computeSessions.internalHeartbeat, { computeSessionId });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (route.action === "idle") {
    const body = await readJsonBody(request);
    const runId = typeof body?.run_id === "string" ? body.run_id.trim() : "";
    if (!runId) {
      return new Response(JSON.stringify({ detail: "run_id is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    await ctx.runMutation(internal.computeSessions.internalHeartbeat, { computeSessionId });
    await ctx.runMutation(internal.computeSessions.internalMarkIdleAfterRun, {
      computeSessionId,
      runId: runId as Id<"runs">,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
}

export const getComputeSessionRuntime = httpAction(async (ctx, request) => {
  const route = parseComputeSessionRuntimeRoute(new URL(request.url).pathname);
  if (!route) {
    return new Response(JSON.stringify({ detail: "path must be /api/compute_sessions/{compute_session_id}/runtime/{action}" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  return handleComputeSessionRuntimeGet(ctx, request, route);
});

export const postComputeSessionRuntime = httpAction(async (ctx, request) => {
  const route = parseComputeSessionRuntimeRoute(new URL(request.url).pathname);
  if (!route) {
    return new Response(JSON.stringify({ detail: "path must be /api/compute_sessions/{compute_session_id}/runtime/{action}" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  return handleComputeSessionRuntimePost(ctx, request, route);
});
