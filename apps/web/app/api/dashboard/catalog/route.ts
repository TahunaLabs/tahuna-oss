import { proxyWithAuth } from "../_proxy"

export async function GET(req: Request) {
  return proxyWithAuth(req, "/catalog", { method: "GET" })
}
