import { NextResponse } from "next/server"

const DEFAULT_COOKIE_NAME = "tahuna_auth_token"

export async function POST() {
  const cookieName = process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME
  const resp = NextResponse.json({ ok: true })
  resp.cookies.set({
    name: cookieName,
    value: "",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  })
  return resp
}
