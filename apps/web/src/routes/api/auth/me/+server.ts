import type { RequestHandler } from './$types';
import { backendURL, cookieName } from '$lib/server/config';
import { jsonError, jsonOK, parseErrorDetail } from '$lib/server/http';

export const GET: RequestHandler = async ({ cookies }) => {
  const token = cookies.get(cookieName()) || '';
  if (!token) {
    return jsonError('authentication required', 401);
  }

  const upstream = await fetch(backendURL('/auth/me'), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store'
  });

  if (!upstream.ok) {
    return jsonError(await parseErrorDetail(upstream), upstream.status);
  }

  return jsonOK(await upstream.json(), upstream.status);
};
