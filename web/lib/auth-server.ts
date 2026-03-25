import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

const tahunaApiUrl =
  process.env.NEXT_PUBLIC_TAHUNA_BACKEND_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL;
const tahunaSiteUrl =
  process.env.NEXT_PUBLIC_TAHUNA_SITE_URL ||
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

if (!tahunaApiUrl || !tahunaSiteUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_TAHUNA_BACKEND_URL/NEXT_PUBLIC_TAHUNA_SITE_URL (or compatible legacy aliases).",
  );
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
