import type { RequestHandler } from './$types';
import { jsonError, readJSONBody } from '$lib/server/http';
import { proxyWithAuth } from '$lib/server/proxy';

export const GET: RequestHandler = async (event) => proxyWithAuth(event, '/experiments', { method: 'GET' });

export const POST: RequestHandler = async (event) => {
  const body = (await readJSONBody(event.request)) as { env_id?: string; name?: string } | null;
  const envID = body?.env_id?.trim() || '';
  if (!envID) {
    return jsonError('env_id is required', 400);
  }

  return proxyWithAuth(event, `/environments/${envID}/experiments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: body?.name ?? '' })
  });
};
