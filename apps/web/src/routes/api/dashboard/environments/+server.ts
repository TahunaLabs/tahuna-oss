import type { RequestHandler } from './$types';
import { proxyWithAuth } from '$lib/server/proxy';
import { readJSONBody } from '$lib/server/http';

export const GET: RequestHandler = async (event) => proxyWithAuth(event, '/environments', { method: 'GET' });

export const POST: RequestHandler = async (event) => {
  const body = await readJSONBody(event.request);
  return proxyWithAuth(event, '/environments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
};
