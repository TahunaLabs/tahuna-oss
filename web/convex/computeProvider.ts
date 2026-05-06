import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "@convex/_generated/server";
import type { ComputeProvider } from "@convex/core/compute";
import {
  hostedRunpodComputeProvider,
  resolveHostedRunpodCompatibilityCloudType,
} from "@convex/cloud/runpodComputeComposition";
import { getLatestActiveRunpodCredentialForUserId } from "@convex/runpodCredentialsStore";

export type { ComputeProvider } from "@convex/core/compute";

export const computeProvider: ComputeProvider = hostedRunpodComputeProvider;

export async function resolveActiveComputeCredentialForUserId(ctx: QueryCtx | MutationCtx, userId: string) {
  const credential = await getLatestActiveRunpodCredentialForUserId(ctx, userId);
  if (!credential) {
    throw new ConvexError("No compute provider configured. Add one in Settings → Providers.");
  }
  return { providerCredentialId: String(credential.credentialId) };
}

export function resolveComputeCompatibilityCloudType() {
  return resolveHostedRunpodCompatibilityCloudType();
}
