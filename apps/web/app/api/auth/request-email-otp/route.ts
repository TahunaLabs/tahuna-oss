import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail, readJSONBody } from "../_shared"

const USER_SAFE_ERROR = "Authentication is temporarily unavailable. Please try again later."

export async function POST(req: Request) {
  try {
    const body = await readJSONBody(req)
    const upstream = await fetch(backendURL("/auth/request-email-otp"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })

    if (!upstream.ok) {
      const detail = await parseErrorDetail(upstream)
      if (upstream.status >= 500) {
        return NextResponse.json({ detail: USER_SAFE_ERROR }, { status: upstream.status })
      }
      return NextResponse.json({ detail }, { status: upstream.status })
    }

    return NextResponse.json(await upstream.json(), { status: upstream.status })
  } catch (err) {
    console.error("[web/api/auth/request-email-otp] Unexpected proxy failure", err)
    return NextResponse.json({ detail: USER_SAFE_ERROR }, { status: 503 })
  }
}
