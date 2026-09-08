import { ConvexError } from "convex/values";

export function requireManagedRunpodApiKey() {
  const apiKey = process.env.TAHUNA_MANAGED_RUNPOD_API_KEY?.trim() || "";
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
