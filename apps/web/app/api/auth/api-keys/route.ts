import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail, readJSONBody } from "../_shared"

const USER_SAFE_ERROR = "Could not create API key right now. Please try again later."

export async function POST(req: Request) {
  try {
    const body = await readJSONBody(req)
    const upstream = await fetch(backendURL("/auth/api-keys"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })

    if (!upstream.ok) {
      const detail = await parseErrorDetail(upstream)
      return NextResponse.json({ detail: detail || USER_SAFE_ERROR }, { status: upstream.status })
    }

    return NextResponse.json(await upstream.json(), { status: upstream.status })
  } catch (err) {
    console.error("[web/api/auth/api-keys] Unexpected proxy failure", err)
    return NextResponse.json({ detail: USER_SAFE_ERROR }, { status: 503 })
  }
}
