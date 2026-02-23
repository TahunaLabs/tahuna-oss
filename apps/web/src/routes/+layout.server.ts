import type { LayoutServerLoad } from './$types';
import { cookieName } from '$lib/server/config';

export const load: LayoutServerLoad = async ({ cookies }) => {
  return {
    isAuthenticated: Boolean(cookies.get(cookieName()))
  };
};
