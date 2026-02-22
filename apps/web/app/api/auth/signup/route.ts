import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail, readJSONBody } from "../_shared"

const USER_SAFE_ERROR = "Authentication is temporarily unavailable. Please try again later."

export async function POST(req: Request) {
  try {
    const body = await readJSONBody(req)
    const upstream = await fetch(backendURL("/auth/signup"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })

    if (!upstream.ok) {
      const detail = await parseErrorDetail(upstream)
      console.error("[web/api/auth/signup] Upstream signup failed", { status: upstream.status, detail })
      if (upstream.status >= 500) {
        return NextResponse.json({ detail: USER_SAFE_ERROR }, { status: upstream.status })
      }
      return NextResponse.json({ detail }, { status: upstream.status })
    }

    const data = await upstream.json()
    const resp = NextResponse.json(data, { status: upstream.status })
    const setCookie = upstream.headers.get("set-cookie")
    if (setCookie) {
      resp.headers.set("set-cookie", setCookie)
    }
    return resp
  } catch (err) {
    console.error("[web/api/auth/signup] Unexpected signup proxy failure", err)
    return NextResponse.json({ detail: USER_SAFE_ERROR }, { status: 503 })
  }
}
