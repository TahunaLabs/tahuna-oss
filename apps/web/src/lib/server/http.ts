export async function readJSONBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function parseErrorDetail(resp: Response): Promise<string> {
  try {
    const data = (await resp.json()) as { detail?: string };
    if (data?.detail && data.detail.trim() !== '') {
      return data.detail;
    }
  } catch {
    // noop
  }
  return `request failed with status ${resp.status}`;
}

export function jsonError(detail: string, status: number): Response {
  return new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export function jsonOK(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
