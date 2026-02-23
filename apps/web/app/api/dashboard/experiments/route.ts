import { NextResponse } from "next/server"
import { readJSONBody } from "../../auth/_shared"
import { proxyWithAuth } from "../_proxy"

export async function GET(req: Request) {
  return proxyWithAuth(req, "/experiments", { method: "GET" })
}

export async function POST(req: Request) {
  const body = (await readJSONBody(req)) as { env_id?: string; name?: string } | null
  const envID = body?.env_id?.trim() || ""
  if (!envID) {
    return NextResponse.json({ detail: "env_id is required" }, { status: 400 })
  }

  return proxyWithAuth(req, `/environments/${envID}/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: body?.name ?? "" }),
  })
}
