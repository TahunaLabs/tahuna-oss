import { NextResponse } from "next/server"
import { backendURL, parseErrorDetail, readJSONBody } from "../_shared"

export async function POST(req: Request) {
  const body = (await readJSONBody(req)) as { api_key?: string } | null
  const apiKey = body?.api_key?.trim()
  if (!apiKey) {
    return NextResponse.json({ detail: "api_key is required" }, { status: 400 })
  }

  const upstream = await fetch(backendURL("/auth/sessions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  })

  if (!upstream.ok) {
    return NextResponse.json({ detail: await parseErrorDetail(upstream) }, { status: upstream.status })
  }

  const data = await upstream.json()
  const resp = NextResponse.json(data, { status: upstream.status })
  const setCookie = upstream.headers.get("set-cookie")
  if (setCookie) {
    resp.headers.set("set-cookie", setCookie)
  }
  return resp
}

export async function DELETE(req: Request) {
  const upstream = await fetch(backendURL("/auth/sessions"), {
    method: "DELETE",
    headers: {
      Cookie: req.headers.get("cookie") ?? "",
    },
    cache: "no-store",
  })

  if (!upstream.ok) {
    return NextResponse.json({ detail: await parseErrorDetail(upstream) }, { status: upstream.status })
  }

  const data = await upstream.json()
  const resp = NextResponse.json(data, { status: upstream.status })
  const setCookie = upstream.headers.get("set-cookie")
  if (setCookie) {
    resp.headers.set("set-cookie", setCookie)
  }
  return resp
}
