import { internal } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { httpAction } from "@convex/_generated/server"
import { authenticateApiRequest, corsHeaders, readJsonBody, toClientErrorDetail } from "@convex/cli/shared"
import { handleServeRuntimeGet, handleServeRuntimePost, handleStopServe, parseServeRuntimeRoute } from "@convex/servesHttp"

export const postServeAction = httpAction(async (ctx, request) => {
  const pathname = new URL(request.url).pathname
  if (pathname.endsWith("/stop")) {
    return handleStopServe(ctx, request, authenticateApiRequest)
  }

  const route = parseServeRuntimeRoute(pathname)
  if (!route) {
    return new Response(JSON.stringify({ detail: "path must be /api/serves/{serve_id}/runtime/{action}" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }
  return handleServeRuntimePost(ctx, request, route)
})

export const listServes = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request)
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  const data = await ctx.runQuery(internal.serves.internalList, { userId })
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  })
})

export const createServe = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request)
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  const body = await readJsonBody(request)
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id : ""
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }
  try {
    const data = await ctx.runMutation(internal.serves.internalCreate, {
      userId,
      environmentId: environmentId as Id<"environments">,
      fromRunId: typeof body?.from_run_id === "string" ? (body.from_run_id as Id<"runs">) : undefined,
      fromStoragePrefix:
        typeof body?.from_storage_prefix === "string" ? body.from_storage_prefix.trim() : undefined,
      modelPath: typeof body?.model_path === "string" ? body.model_path.trim() : undefined,
    })
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to create serve")
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }
})

export const getServeOrLogs = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const runtimeRoute = parseServeRuntimeRoute(url.pathname)
  if (runtimeRoute) {
    return handleServeRuntimeGet(ctx, request, runtimeRoute)
  }

  const userId = await authenticateApiRequest(ctx, request)
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  const parts = url.pathname.split("/").filter(Boolean)
  const isLogs = parts[parts.length - 1] === "logs"
  const serveId = isLogs ? parts[parts.length - 2] : parts[parts.length - 1]

  if (!serveId || serveId === "serves") {
    return new Response(JSON.stringify({ detail: "serve_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  if (isLogs) {
    try {
      const data = await ctx.runQuery(internal.serves.internalGetLogs, {
        userId,
        serveId: serveId as Id<"serves">,
      })
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      })
    } catch (err) {
      const detail = toClientErrorDetail(err, "failed to load serve logs")
      return new Response(JSON.stringify({ detail }), {
        status: 404,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      })
    }
  }

  try {
    const data = await ctx.runQuery(internal.serves.internalGet, {
      userId,
      serveId: serveId as Id<"serves">,
    })
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to load serve")
    return new Response(JSON.stringify({ detail }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }
})
