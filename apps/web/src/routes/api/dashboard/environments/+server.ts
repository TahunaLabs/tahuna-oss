import { jsonError, readJSONBody } from '$lib/server/http';
import { proxyWithAuth } from '$lib/server/proxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => proxyWithAuth(event, '/environments', { method: 'GET' });

export const POST: RequestHandler = async (event) => {
  const body = await readJSONBody(event.request);
  return proxyWithAuth(event, '/environments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
};

export const DELETE: RequestHandler = async (event) => {
  const envID = event.url.searchParams.get('env_id')?.trim() || '';
  if (!envID) {
    return jsonError('env_id is required', 400);
  }
  return proxyWithAuth(event, `/environments/${envID}`, { method: 'DELETE' });
};
