import type { ComputeProvider } from "@convex/core/compute";
import {
  hostedRunpodComputeProvider,
  resolveHostedRunpodCompatibilityCloudType,
} from "@convex/cloud/runpodComputeComposition";
import {
  MANAGED_RUNPOD_PROVIDER_CREDENTIAL_ID,
  requireManagedRunpodApiKey,
} from "@convex/runpodCredentialSecrets";

export type { ComputeProvider } from "@convex/core/compute";

export const computeProvider: ComputeProvider = hostedRunpodComputeProvider;

export function resolveManagedComputeCredential() {
  requireManagedRunpodApiKey();
  return { providerCredentialId: MANAGED_RUNPOD_PROVIDER_CREDENTIAL_ID };
}

export function resolveComputeCompatibilityCloudType() {
  return resolveHostedRunpodCompatibilityCloudType();
}
