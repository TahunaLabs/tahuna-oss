import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail, readJSONBody } from "../_shared"

export async function POST(req: Request) {
  const secret = process.env.BOOTSTRAP_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ detail: "BOOTSTRAP_SECRET is not configured" }, { status: 500 })
  }

  const body = await readJSONBody(req)
  const upstream = await fetch(backendURL("/auth/bootstrap"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Bootstrap-Secret": secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  })

  if (!upstream.ok) {
    return NextResponse.json({ detail: await parseErrorDetail(upstream) }, { status: upstream.status })
  }

  const data = await upstream.json()
  return NextResponse.json(data, { status: upstream.status })
}
