import { ConvexError } from "convex/values";

export const MANAGED_RUNPOD_PROVIDER_CREDENTIAL_ID = "managed:runpod";

export function requireManagedRunpodApiKey() {
  const apiKey = (
    process.env.TAHUNA_MANAGED_RUNPOD_API_KEY?.trim() ||
    process.env.RUNPOD_API_KEY?.trim() ||
    ""
  );
  if (!apiKey) {
    throw new ConvexError("managed provider API key is not configured");
  }
  return apiKey;
}

export function trimRunpodApiKeyOrThrow(value: string) {
  const apiKey = value.trim();
  if (!apiKey) {
    throw new ConvexError("managed provider API key is required");
  }
  return apiKey;
}
