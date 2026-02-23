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
