import type { RequestHandler } from './$types';
import { backendURL, cookieName } from '$lib/server/config';
import { jsonError, jsonOK, parseErrorDetail, readJSONBody } from '$lib/server/http';

const USER_SAFE_ERROR = 'Could not create API key right now. Please try again later.';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const token = cookies.get(cookieName()) || '';
    if (!token) {
      return jsonError('authentication required', 401);
    }

    const body = await readJSONBody(request);
    const upstream = await fetch(backendURL('/auth/api-keys'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    if (!upstream.ok) {
      const detail = await parseErrorDetail(upstream);
      return jsonError(detail || USER_SAFE_ERROR, upstream.status);
    }

    return jsonOK(await upstream.json(), upstream.status);
  } catch (err) {
    console.error('[web/api/auth/api-keys] Unexpected proxy failure', err);
    return jsonError(USER_SAFE_ERROR, 503);
  }
};
