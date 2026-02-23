import { jsonError, readJSONBody } from '$lib/server/http';
import { proxyWithAuth } from '$lib/server/proxy';
import type { RequestHandler } from './$types';

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

export const DELETE: RequestHandler = async (event) => {
  const expID = event.url.searchParams.get('exp_id')?.trim() || '';
  if (!expID) {
    return jsonError('exp_id is required', 400);
  }
  return proxyWithAuth(event, `/experiments/${expID}`, { method: 'DELETE' });
};
