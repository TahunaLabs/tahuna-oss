import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail } from "../_shared"

export async function GET(req: Request) {
  const upstream = await fetch(backendURL("/auth/me"), {
    method: "GET",
    headers: {
      Cookie: req.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  })

  if (!upstream.ok) {
    return NextResponse.json({ detail: await parseErrorDetail(upstream) }, { status: upstream.status })
  }

  return NextResponse.json(await upstream.json(), { status: upstream.status })
}
