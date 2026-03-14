import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

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
  isAuthenticated: rawIsAuthenticated,
  getToken: rawGetToken,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({ convexUrl: tahunaApiUrl, convexSiteUrl: tahunaSiteUrl });

function isRecoverableAuthConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as Error & {
    code?: string;
    cause?: unknown;
    path?: string;
  };

  if (candidate.code === "ConnectionRefused") {
    return true;
  }

  if (candidate.path?.includes("/api/auth/convex/token")) {
    return true;
  }

  if (candidate.message.includes("Unable to connect")) {
    return true;
  }

  return false;
}

export async function getToken() {
  try {
    return await rawGetToken();
  } catch (error) {
    if (isRecoverableAuthConnectivityError(error)) {
      return null;
    }
    throw error;
  }
}

export async function isAuthenticated() {
  try {
    return await rawIsAuthenticated();
  } catch (error) {
    if (isRecoverableAuthConnectivityError(error)) {
      return false;
    }
    throw error;
  }
}

export {
  handler,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
};
