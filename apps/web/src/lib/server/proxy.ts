import type { RequestEvent } from '@sveltejs/kit';
import { backendURL, cookieName } from './config';
import { jsonError, jsonOK, parseErrorDetail } from './http';

export async function proxyWithAuth(event: RequestEvent, path: string, init?: RequestInit): Promise<Response> {
  const token = event.cookies.get(cookieName()) || '';
  if (!token) {
    return jsonError('authentication required', 401);
  }

  const upstream = await fetch(backendURL(path), {
    cache: 'no-store',
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });

  if (!upstream.ok) {
    return jsonError(await parseErrorDetail(upstream), upstream.status);
  }

  return jsonOK(await upstream.json(), upstream.status);
}
