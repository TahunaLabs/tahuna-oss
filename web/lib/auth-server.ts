import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { JWT_COOKIE_NAME } from "@convex-dev/better-auth/plugins";
import { getSessionCookie } from "better-auth/cookies";
import { decodeJwt } from "jose";
import { headers } from "next/headers";

const tahunaApiUrl =
  process.env.NEXT_PUBLIC_TAHUNA_API_URL ||
  process.env.NEXT_PUBLIC_CONVEX_URL;
const tahunaSiteUrl =
  process.env.NEXT_PUBLIC_TAHUNA_SITE_URL ||
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

if (!tahunaApiUrl || !tahunaSiteUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_TAHUNA_API_URL/NEXT_PUBLIC_TAHUNA_SITE_URL (or compatible legacy aliases).",
  );
}

const {
  handler,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({ convexUrl: tahunaApiUrl, convexSiteUrl: tahunaSiteUrl });

async function readAuthTokenFromCookie() {
  const requestHeaders = new Headers(await headers());
  const token = getSessionCookie(requestHeaders, {
    cookieName: JWT_COOKIE_NAME,
  });

  if (!token) {
    return null;
  }

  try {
    const claims = decodeJwt(token);
    const exp = claims.exp;
    const now = Math.floor(Date.now() / 1000);
    if (typeof exp === "number" && now > exp + 60) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export async function getToken() {
  return await readAuthTokenFromCookie();
}

export async function isAuthenticated() {
  return (await readAuthTokenFromCookie()) !== null;
}

export {
  handler,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
};
