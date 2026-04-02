import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { fetchAuthQuery, isAuthenticated } from "@/lib/auth-server"
import { serveInferencePath, serveInferenceUpstreamBaseUrl } from "@/lib/serve-inference"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteParams = {
  serveId: string
}

type RouteContext = {
  params: Promise<RouteParams> | RouteParams
}

type ServeInferenceTarget = {
  serve_id: string
  status: string
  pod_id: string
  port: number
  inference_path: string
}

class InferenceProxyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const REQUEST_HEADER_BLOCKLIST = new Set([
  "accept-encoding",
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

const RESPONSE_HEADER_BLOCKLIST = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

function noStoreHeaders(init?: HeadersInit) {
  const headers = new Headers(init)
  headers.set("Cache-Control", "no-store")
  return headers
}

function jsonError(status: number, detail: string) {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: noStoreHeaders({ "Content-Type": "application/json" }),
  })
}

function trimErrorLine(value: string) {
  return value.split("\n")[0]?.trim() || ""
}

function detailFromResponseBody(body: string, fallback: string) {
  const trimmed = body.trim()
  if (!trimmed) {
    return fallback
  }
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown }
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim()
    }
  } catch {
    // Fall back to the plain-text body below.
  }
  return trimmed
}

function statusFromDetail(detail: string) {
  const normalized = detail.toLowerCase()
  if (normalized.includes("not found")) {
    return 404
  }
  if (normalized.includes("authentication required") || normalized.includes("not authenticated")) {
    return 401
  }
  if (normalized.includes("not serving") || normalized.includes("live inference runtime")) {
    return 409
  }
  return 400
}

function ensureConvexSiteUrl() {
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim()
  if (!siteUrl) {
    throw new InferenceProxyError(500, "NEXT_PUBLIC_CONVEX_SITE_URL is required")
  }
  return siteUrl.replace(/\/+$/, "")
}

async function resolveServeTargetByApiKey(serveId: string, authorization: string): Promise<ServeInferenceTarget> {
  const response = await fetch(`${ensureConvexSiteUrl()}/api/serves/${encodeURIComponent(serveId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: authorization,
    },
    cache: "no-store",
  })
  const body = await response.text()
  if (!response.ok) {
    throw new InferenceProxyError(response.status, detailFromResponseBody(body, "failed to load serve"))
  }

  let payload: Partial<ServeInferenceTarget> | null = null
  try {
    payload = body ? (JSON.parse(body) as Partial<ServeInferenceTarget>) : null
  } catch {
    throw new InferenceProxyError(502, "failed to load serve")
  }

  return {
    serve_id: typeof payload?.serve_id === "string" && payload.serve_id ? payload.serve_id : serveId,
    status: typeof payload?.status === "string" ? payload.status : "",
    pod_id: typeof payload?.pod_id === "string" ? payload.pod_id : "",
    port: typeof payload?.port === "number" ? payload.port : 0,
    inference_path:
      typeof payload?.inference_path === "string" && payload.inference_path
        ? payload.inference_path
        : serveInferencePath(serveId),
  }
}

async function resolveServeTargetBySession(serveId: string): Promise<ServeInferenceTarget> {
  if (!(await isAuthenticated())) {
    throw new InferenceProxyError(401, "authentication required")
  }
  try {
    return await fetchAuthQuery(api.serves.getInferenceTarget, {
      serveId: serveId as Id<"serves">,
    })
  } catch (error) {
    const detail = trimErrorLine(error instanceof Error ? error.message : "") || "failed to load serve"
    throw new InferenceProxyError(statusFromDetail(detail), detail)
  }
}

async function resolveServeTarget(request: Request, serveId: string) {
  const authorization = request.headers.get("authorization")?.trim() || ""
  if (authorization) {
    return resolveServeTargetByApiKey(serveId, authorization)
  }
  return resolveServeTargetBySession(serveId)
}

function resolveUpstreamUrl(request: Request, target: ServeInferenceTarget) {
  if (target.status !== "serving") {
    throw new InferenceProxyError(409, "serve is not serving")
  }

  let upstreamBase: string
  try {
    upstreamBase = serveInferenceUpstreamBaseUrl(target.pod_id, target.port)
  } catch (error) {
    const detail = trimErrorLine(error instanceof Error ? error.message : "") || "failed to resolve serve runtime"
    throw new InferenceProxyError(statusFromDetail(detail), detail)
  }

  const requestUrl = new URL(request.url)
  const canonicalPath = target.inference_path || serveInferencePath(target.serve_id || "")
  const upstreamPath = requestUrl.pathname.startsWith(canonicalPath)
    ? requestUrl.pathname.slice(canonicalPath.length) || "/"
    : "/"
  const upstreamUrl = new URL(upstreamPath, `${upstreamBase}/`)
  upstreamUrl.search = requestUrl.search
  return upstreamUrl
}

function buildUpstreamRequestHeaders(request: Request, target: ServeInferenceTarget) {
  const headers = new Headers()
  for (const [name, value] of request.headers) {
    const normalized = name.toLowerCase()
    if (
      REQUEST_HEADER_BLOCKLIST.has(normalized)
      || normalized.startsWith("cf-")
      || normalized.startsWith("x-forwarded-")
    ) {
      continue
    }
    headers.set(name, value)
  }
  headers.set("x-tahuna-inference-proxy", "1")
  headers.set("x-tahuna-serve-id", target.serve_id)
  return headers
}

function buildClientResponseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers()
  for (const [name, value] of upstreamHeaders) {
    if (RESPONSE_HEADER_BLOCKLIST.has(name.toLowerCase())) {
      continue
    }
    headers.set(name, value)
  }
  headers.set("Cache-Control", "no-store")
  return headers
}

async function handleInferenceRequest(request: Request, context: RouteContext) {
  try {
    const { serveId } = await context.params
    if (!serveId) {
      return jsonError(400, "serve_id is required")
    }

    const target = await resolveServeTarget(request, serveId)
    const upstreamUrl = resolveUpstreamUrl(request, target)
    const method = request.method.toUpperCase()
    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: buildUpstreamRequestHeaders(request, target),
      body: method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    })

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: buildClientResponseHeaders(upstreamResponse.headers),
    })
  } catch (error) {
    if (error instanceof InferenceProxyError) {
      return jsonError(error.status, error.message)
    }
    return jsonError(502, "failed to reach live serve")
  }
}

export async function GET(request: Request, context: RouteContext) {
  return handleInferenceRequest(request, context)
}

export async function HEAD(request: Request, context: RouteContext) {
  return handleInferenceRequest(request, context)
}

export async function POST(request: Request, context: RouteContext) {
  return handleInferenceRequest(request, context)
}

export async function PUT(request: Request, context: RouteContext) {
  return handleInferenceRequest(request, context)
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleInferenceRequest(request, context)
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleInferenceRequest(request, context)
}

export async function OPTIONS(request: Request, context: RouteContext) {
  return handleInferenceRequest(request, context)
}
