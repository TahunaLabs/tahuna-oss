import { internal } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import type { ActionCtx } from "@convex/_generated/server"
import { corsHeaders, extractBearerToken, readJsonBody, toClientErrorDetail } from "@convex/cli/shared"
import { sha256Hex } from "@convex/syncManifest"

const RUNTIME_STATUS_VALUES = [
  "provisioning",
  "starting",
  "serving",
  "stopping",
  "stopped",
  "failed",
] as const
const RUNTIME_STATUS_SET = new Set<string>(RUNTIME_STATUS_VALUES)
type RuntimeStatus = (typeof RUNTIME_STATUS_VALUES)[number]

export type ServeRuntimeRoute = {
  serveId: string;
  action: string;
}

export function parseServeRuntimeRoute(pathname: string): ServeRuntimeRoute | null {
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length < 5 || parts[0] !== "api" || parts[1] !== "serves" || parts[3] !== "runtime") {
    return null
  }
  const serveId = parts[2]
  const action = parts.slice(4).join("/")
  if (!serveId || !action) {
    return null
  }
  return { serveId, action }
}

async function authenticateRuntimeRequest(
  ctx: ActionCtx,
  request: Request,
  serveId: Id<"serves">,
): Promise<boolean> {
  const token = extractBearerToken(request)
  if (!token) {
    return false
  }
  const tokenHash = await sha256Hex(token)
  return await ctx.runQuery(internal.serves.internalValidateRuntimeToken, {
    serveId,
    tokenHash,
  })
}

export async function handleServeRuntimeGet(ctx: ActionCtx, request: Request, route: ServeRuntimeRoute) {
  const serveId = route.serveId as Id<"serves">
  const authenticated = await authenticateRuntimeRequest(ctx, request, serveId)
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  if (route.action === "bootstrap") {
    try {
      const plan = await ctx.runAction(internal.serves.internalGetRuntimeBootstrapPlan, { serveId })
      return new Response(JSON.stringify(plan), {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      })
    } catch (err) {
      const detail = toClientErrorDetail(err, "failed to build serve bootstrap plan")
      return new Response(JSON.stringify({ detail }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      })
    }
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  })
}

export async function handleServeRuntimePost(ctx: ActionCtx, request: Request, route: ServeRuntimeRoute) {
  const serveId = route.serveId as Id<"serves">
  const authenticated = await authenticateRuntimeRequest(ctx, request, serveId)
  if (!authenticated) {
    return new Response(JSON.stringify({ detail: "runtime authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  const body = await readJsonBody(request)

  if (route.action === "logs") {
    const candidateLines: unknown[] = Array.isArray(body?.lines) ? (body.lines as unknown[]) : []
    const lines = candidateLines
      .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
      .map((item) => ({
        message: typeof item.message === "string" ? item.message : "",
        level: typeof item.level === "string" ? item.level : undefined,
        source: typeof item.source === "string" ? item.source : undefined,
        timestamp: typeof item.timestamp === "number" ? item.timestamp : undefined,
      }))
    const result = await ctx.runMutation(internal.serves.ingestRuntimeLogs, {
      serveId,
      lines,
    })
    return new Response(JSON.stringify({ ok: true, accepted: result.accepted }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  if (route.action === "status") {
    const status = typeof body?.status === "string" ? body.status : ""
    const message = typeof body?.message === "string" ? body.message : undefined
    const error = typeof body?.error === "string" ? body.error : undefined
    if (!status) {
      return new Response(JSON.stringify({ detail: "status is required" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      })
    }
    if (!RUNTIME_STATUS_SET.has(status)) {
      return new Response(JSON.stringify({ detail: "invalid status" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      })
    }
    const result = await ctx.runMutation(internal.serves.ingestRuntimeStatus, {
      serveId,
      status: status as RuntimeStatus,
      message,
      error,
    })
    return new Response(JSON.stringify({ ok: true, status: result.status }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  return new Response(JSON.stringify({ detail: "runtime endpoint not found" }), {
    status: 404,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  })
}

export async function handleStopServe(
  ctx: ActionCtx,
  request: Request,
  authenticateApiRequest: (ctx: ActionCtx, request: Request) => Promise<string | null>,
) {
  const userId = await authenticateApiRequest(ctx, request)
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  const url = new URL(request.url)
  const parts = url.pathname.split("/").filter(Boolean)
  const serveIdx = parts.findIndex((part) => part === "serves")
  const serveId = serveIdx >= 0 ? parts[serveIdx + 1] : ""
  const tail = parts[parts.length - 1]
  if (!serveId || tail !== "stop") {
    return new Response(JSON.stringify({ detail: "path must be /api/serves/{serve_id}/stop" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }

  const body = await readJsonBody(request)
  const force = body?.force === true || body?.force === "true" || body?.force === 1
  try {
    const data = await ctx.runMutation(internal.serves.internalStop, {
      userId,
      serveId: serveId as Id<"serves">,
      force,
    })
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to stop serve")
    const status = detail.toLowerCase().includes("already") ? 409 : 400
    return new Response(JSON.stringify({ detail }), {
      status,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    })
  }
}
