import type { RequestHandler } from './$types';
import { proxyWithAuth } from '$lib/server/proxy';

export const GET: RequestHandler = async (event) => proxyWithAuth(event, '/catalog', { method: 'GET' });
