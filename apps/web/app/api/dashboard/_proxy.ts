import { NextResponse } from "next/server"
import { readJWTFromCookieHeader } from "../auth/_jwt"
import { backendURL, parseErrorDetail } from "../auth/_shared"

export function requireAuthToken(req: Request): string | NextResponse {
  const token = readJWTFromCookieHeader(req)
  if (!token) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 })
  }
  return token
}

export async function proxyWithAuth(req: Request, path: string, init?: RequestInit): Promise<Response | NextResponse> {
  const tokenOrResp = requireAuthToken(req)
  if (tokenOrResp instanceof NextResponse) {
    return tokenOrResp
  }

  const upstream = await fetch(backendURL(path), {
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${tokenOrResp}`,
      ...(init?.headers ?? {}),
    },
  })

  if (!upstream.ok) {
    return NextResponse.json({ detail: await parseErrorDetail(upstream) }, { status: upstream.status })
  }

  return NextResponse.json(await upstream.json(), { status: upstream.status })
}
