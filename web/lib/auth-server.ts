import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

export function getAuthHandlers() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexUrl || !convexSiteUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_CONVEX_SITE_URL are required");
  }
  return convexBetterAuthNextJs({ convexUrl, convexSiteUrl }).handler;
}
