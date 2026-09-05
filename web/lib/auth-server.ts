import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

const tahunaApiUrl = process.env.CONVEX_INTERNAL_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
const tahunaSiteUrl = process.env.CONVEX_INTERNAL_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

if (!tahunaApiUrl || !tahunaSiteUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL/NEXT_PUBLIC_CONVEX_SITE_URL");
}

export const {
  handler,
  isAuthenticated,
  getToken,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({ convexUrl: tahunaApiUrl, convexSiteUrl: tahunaSiteUrl });
