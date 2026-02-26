import { NextResponse } from "next/server"
import { readJSONBody } from "../../auth/_shared"
import { proxyWithAuth } from "../_proxy"

export async function GET(req: Request) {
  return proxyWithAuth(req, "/environments", { method: "GET" })
}

export async function POST(req: Request) {
  const body = await readJSONBody(req)
  return proxyWithAuth(req, "/environments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const envID = url.searchParams.get("env_id")?.trim() || ""
  if (!envID) {
    return NextResponse.json({ detail: "env_id is required" }, { status: 400 })
  }

  return proxyWithAuth(req, `/environments/${envID}`, { method: "DELETE" })
}
