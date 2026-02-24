import { jsonError, readJSONBody } from '$lib/server/http';
import { proxyWithAuth } from '$lib/server/proxy';
import type { RequestHandler } from './$types';

type RunCreateBody = {
  environment_id?: string;
  gpu_type?: string;
  gpu_count?: number;
  volume_gb?: number;
};

export const GET: RequestHandler = async (event) => proxyWithAuth(event, '/runs', { method: 'GET' });

export const POST: RequestHandler = async (event) => {
  const body = (await readJSONBody(event.request)) as RunCreateBody | null;
  const environmentID = body?.environment_id?.trim() || '';
  if (!environmentID) {
    return jsonError('environment_id is required', 400);
  }

  const payload: Record<string, string | number> = {};
  if (typeof body?.gpu_type === 'string' && body.gpu_type.trim()) {
    payload.gpu_type = body.gpu_type.trim();
  }
  if (typeof body?.gpu_count === 'number') {
    payload.gpu_count = body.gpu_count;
  }
  if (typeof body?.volume_gb === 'number') {
    payload.volume_gb = body.volume_gb;
  }

  return proxyWithAuth(event, `/environments/${environmentID}/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
};

export const DELETE: RequestHandler = async (event) => {
  const runID = event.url.searchParams.get('run_id')?.trim() || '';
  if (!runID) {
    return jsonError('run_id is required', 400);
  }
  return proxyWithAuth(event, `/runs/${runID}`, { method: 'DELETE' });
};
