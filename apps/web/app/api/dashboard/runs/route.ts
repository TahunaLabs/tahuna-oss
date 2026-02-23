import { NextResponse } from "next/server"
import { readJSONBody } from "../../auth/_shared"
import { proxyWithAuth } from "../_proxy"

type RunCreateBody = {
  experiment_id?: string
  gpu_type?: string
  gpu_count?: number
  volume_gb?: number
}

export async function GET(req: Request) {
  return proxyWithAuth(req, "/runs", { method: "GET" })
}

export async function POST(req: Request) {
  const body = (await readJSONBody(req)) as RunCreateBody | null
  const experimentID = body?.experiment_id?.trim() || ""
  if (!experimentID) {
    return NextResponse.json({ detail: "experiment_id is required" }, { status: 400 })
  }

  const payload: Record<string, string | number> = {}
  if (typeof body?.gpu_type === "string" && body.gpu_type.trim()) {
    payload.gpu_type = body.gpu_type.trim()
  }
  if (typeof body?.gpu_count === "number") {
    payload.gpu_count = body.gpu_count
  }
  if (typeof body?.volume_gb === "number") {
    payload.volume_gb = body.volume_gb
  }

  return proxyWithAuth(req, `/experiments/${experimentID}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const runID = url.searchParams.get("run_id")?.trim() || ""
  if (!runID) {
    return NextResponse.json({ detail: "run_id is required" }, { status: 400 })
  }

  return proxyWithAuth(req, `/runs/${runID}`, { method: "DELETE" })
}
