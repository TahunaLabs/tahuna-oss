import { ConvexHttpClient } from "convex/browser";

export function convexServerClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is required");
  }
  return new ConvexHttpClient(url);
}
