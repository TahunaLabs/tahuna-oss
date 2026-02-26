import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail } from "../_shared"
import { readJWTFromCookieHeader } from "../_jwt"

export async function GET(req: Request) {
  const token = readJWTFromCookieHeader(req)
  if (!token) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 })
  }

  const upstream = await fetch(backendURL("/auth/me"), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  })

  if (!upstream.ok) {
    return NextResponse.json({ detail: await parseErrorDetail(upstream) }, { status: upstream.status })
  }

  return NextResponse.json(await upstream.json(), { status: upstream.status })
}
