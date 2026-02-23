import type { RequestHandler } from './$types';
import { backendURL } from '$lib/server/config';
import { jsonError, jsonOK, parseErrorDetail, readJSONBody } from '$lib/server/http';

const USER_SAFE_ERROR = 'Authentication is temporarily unavailable. Please try again later.';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await readJSONBody(request);
    const upstream = await fetch(backendURL('/auth/request-email-otp'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    if (!upstream.ok) {
      const detail = await parseErrorDetail(upstream);
      if (upstream.status >= 500) {
        return jsonError(USER_SAFE_ERROR, upstream.status);
      }
      return jsonError(detail, upstream.status);
    }

    return jsonOK(await upstream.json(), upstream.status);
  } catch (err) {
    console.error('[web/api/auth/request-email-otp] Unexpected proxy failure', err);
    return jsonError(USER_SAFE_ERROR, 503);
  }
};
