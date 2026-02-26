import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail, readJSONBody } from "../_shared"
import { issueJWT } from "../_jwt"

const USER_SAFE_ERROR = "Verification is temporarily unavailable. Please try again later."

export async function POST(req: Request) {
  try {
    const body = await readJSONBody(req)
    const upstream = await fetch(backendURL("/auth/verify-email-otp"), {
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

    const data = (await upstream.json()) as { user_id?: string }
    if (!data.user_id) {
      return NextResponse.json({ detail: USER_SAFE_ERROR }, { status: 503 })
    }

    const jwt = issueJWT(data.user_id)
    const resp = NextResponse.json(data, { status: upstream.status })
    resp.cookies.set({
      name: jwt.cookieName,
      value: jwt.token,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: jwt.secure,
      maxAge: jwt.maxAge,
    })
    return resp
  } catch (err) {
    console.error("[web/api/auth/verify-email-otp] Unexpected proxy failure", err)
    return NextResponse.json({ detail: USER_SAFE_ERROR }, { status: 503 })
  }
}
