const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000"

export function backendURL(path: string): string {
  const base =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_TAHUNA_API_URL?.trim() ||
    DEFAULT_BACKEND_URL
  return `${base.replace(/\/+$/, "")}${path}`
}

export async function readJSONBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export async function parseErrorDetail(resp: Response): Promise<string> {
  try {
    const data = (await resp.json()) as { detail?: string }
    if (data?.detail && data.detail.trim() !== "") {
      return data.detail
    }
  } catch {
    // noop
  }
  return `request failed with status ${resp.status}`
}
