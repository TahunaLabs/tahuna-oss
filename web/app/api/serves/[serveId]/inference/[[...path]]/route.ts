import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { INFERENCE_PROXY_CONFIG } from "@/config"
import { fetchAuthAction, isAuthenticated } from "@/lib/auth-server"
import { convexServerClient } from "@/lib/convex-server"
import { serveInferencePath } from "@/lib/serve-inference"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteParams = {
  serveId: string
}

type RouteContext = {
  params: Promise<RouteParams>
}

type ServeInferenceTarget = {
  serve_id: string
  status: string
  ingress_url: string
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

const SAFE_SESSION_FETCH_SITES = new Set(["same-origin", "none"])

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

function extractBearerToken(authorization: string) {
  const trimmed = authorization.trim()
  if (!trimmed) {
    return ""
  }
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    throw new InferenceProxyError(401, "authentication required")
  }
  return trimmed.slice("bearer ".length).trim()
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
  if (normalized.includes("too large") || normalized.includes("too big")) {
    return 413
  }
  if (normalized.includes("timed out")) {
    return 504
  }
  if (normalized.includes("forbidden")) {
    return 403
  }
  return 400
}

function enforceSessionRequestProtections(request: Request) {
  const requestOrigin = new URL(request.url).origin
  const origin = request.headers.get("origin")?.trim() || ""
  if (origin && origin !== requestOrigin) {
    throw new InferenceProxyError(403, "forbidden cross-origin session inference request")
  }

  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase() || ""
  if (fetchSite && !SAFE_SESSION_FETCH_SITES.has(fetchSite)) {
    throw new InferenceProxyError(403, "forbidden cross-site session inference request")
  }

  const method = request.method.toUpperCase()
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !origin) {
    throw new InferenceProxyError(403, "forbidden session inference request without same-origin origin header")
  }
}

async function resolveServeTargetByApiKey(serveId: string, authorization: string): Promise<ServeInferenceTarget> {
  try {
    return await convexServerClient().action(api.serves.resolveInferenceTargetByApiKey, {
      serveId: serveId as Id<"serves">,
      apiKey: extractBearerToken(authorization),
    })
  } catch (error) {
    const detail = trimErrorLine(error instanceof Error ? error.message : "") || "failed to load serve"
    throw new InferenceProxyError(statusFromDetail(detail), detail)
  }
}

async function resolveServeTargetBySession(serveId: string): Promise<ServeInferenceTarget> {
  if (!(await isAuthenticated())) {
    throw new InferenceProxyError(401, "authentication required")
  }
  try {
    return await fetchAuthAction(api.serves.resolveInferenceTarget, {
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
  enforceSessionRequestProtections(request)
  return resolveServeTargetBySession(serveId)
}

function resolveUpstreamUrl(request: Request, target: ServeInferenceTarget) {
  if (target.status !== "serving") {
    throw new InferenceProxyError(409, "serve is not serving")
  }

  let upstreamBase: string
  try {
    upstreamBase = target.ingress_url.trim()
    if (!upstreamBase) {
      throw new Error("serve is missing a live inference runtime")
    }
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
  headers.set("X-Content-Type-Options", "nosniff")
  return headers
}

function bodyAllowedForMethod(method: string) {
  return method !== "GET" && method !== "HEAD"
}

async function readRequestBodyWithLimit(request: Request) {
  if (!request.body) {
    return undefined
  }

  const contentLength = request.headers.get("content-length")?.trim() || ""
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10)
    if (Number.isFinite(parsed) && parsed > INFERENCE_PROXY_CONFIG.maxRequestBytes) {
      throw new InferenceProxyError(413, "inference request body too large")
    }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    if (!value) {
      continue
    }
    total += value.byteLength
    if (total > INFERENCE_PROXY_CONFIG.maxRequestBytes) {
      throw new InferenceProxyError(413, "inference request body too large")
    }
    chunks.push(value)
  }

  if (total === 0) {
    return undefined
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
}

async function fetchUpstream(
  upstreamUrl: URL,
  init: {
    method: string
    headers: Headers
    body: ArrayBuffer | undefined
  },
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), INFERENCE_PROXY_CONFIG.upstreamTimeoutMs)
  try {
    return await fetch(upstreamUrl, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new InferenceProxyError(
        504,
        `upstream inference request timed out after ${Math.floor(INFERENCE_PROXY_CONFIG.upstreamTimeoutMs / 1000)}s`,
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
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
    const body = bodyAllowedForMethod(method) ? await readRequestBodyWithLimit(request) : undefined
    const upstreamResponse = await fetchUpstream(upstreamUrl, {
      method,
      headers: buildUpstreamRequestHeaders(request, target),
      body,
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
