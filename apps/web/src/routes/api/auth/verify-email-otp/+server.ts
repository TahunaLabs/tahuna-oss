import type { RequestHandler } from './$types';
import { backendURL } from '$lib/server/config';
import { issueJWT } from '$lib/server/jwt';
import { jsonError, jsonOK, parseErrorDetail, readJSONBody } from '$lib/server/http';

const USER_SAFE_ERROR = 'Verification is temporarily unavailable. Please try again later.';

export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const body = await readJSONBody(request);
    const upstream = await fetch(backendURL('/auth/verify-email-otp'), {
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

    const data = (await upstream.json()) as { user_id?: string };
    if (!data.user_id) {
      return jsonError(USER_SAFE_ERROR, 503);
    }

    const jwt = issueJWT(data.user_id);
    cookies.set(jwt.cookieName, jwt.token, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: jwt.secure,
      maxAge: jwt.maxAge
    });

    return jsonOK(data, upstream.status);
  } catch (err) {
    console.error('[web/api/auth/verify-email-otp] Unexpected proxy failure', err);
    return jsonError(USER_SAFE_ERROR, 503);
  }
};
