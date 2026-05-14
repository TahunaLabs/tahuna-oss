import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "@convex/_generated/server";
import type { ComputeProvider } from "@convex/core/compute";
import {
  hostedRunpodComputeProvider,
  resolveHostedRunpodCompatibilityCloudType,
} from "@convex/cloud/runpodComputeComposition";
import { BILLING_MODE, type BillingMode } from "@convex/core/billingMode";
import { getLatestActiveRunpodCredentialForUserId } from "@convex/runpodCredentialsStore";
import {
  MANAGED_RUNPOD_PROVIDER_CREDENTIAL_ID,
  requireManagedRunpodApiKey,
} from "@convex/runpodCredentialSecrets";

export type { ComputeProvider } from "@convex/core/compute";

export const computeProvider: ComputeProvider = hostedRunpodComputeProvider;

export async function resolveActiveComputeCredentialForUserId(ctx: QueryCtx | MutationCtx, userId: string) {
  const credential = await getLatestActiveRunpodCredentialForUserId(ctx, userId);
  if (!credential) {
    throw new ConvexError(
      "BYOK run requires a Runpod API key. Add one in Settings → Providers or launch with managed billing.",
    );
  }
  return { providerCredentialId: String(credential.credentialId) };
}

export async function resolveComputeCredentialForBillingMode(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  billingMode: BillingMode,
) {
  if (billingMode === BILLING_MODE.BYOK) {
    return resolveActiveComputeCredentialForUserId(ctx, userId);
  }
  requireManagedRunpodApiKey();
  return { providerCredentialId: MANAGED_RUNPOD_PROVIDER_CREDENTIAL_ID };
}

export function resolveComputeCompatibilityCloudType() {
  return resolveHostedRunpodCompatibilityCloudType();
}
