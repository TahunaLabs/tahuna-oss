import type { PageServerLoad } from './$types';
import { cookieName } from '$lib/server/config';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ cookies }) => {
  if (cookies.get(cookieName())) {
    throw redirect(307, '/dashboard');
  }
  return {};
};
