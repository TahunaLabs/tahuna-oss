import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

export const {
  handler,
  isAuthenticated,
  getToken,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({ convexUrl, convexSiteUrl });

/** @deprecated Use `handler` directly instead. */
export function getAuthHandlers() {
  return handler;
}
