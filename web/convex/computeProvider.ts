import type { ComputeProvider } from "@convex/core/compute";
import {
  hostedRunpodComputeProvider,
  resolveHostedRunpodCompatibilityCloudType,
} from "@convex/cloud/runpodComputeComposition";
import { requireManagedRunpodApiKey } from "@convex/runpodCredentialSecrets";

export type { ComputeProvider } from "@convex/core/compute";

export const computeProvider: ComputeProvider = hostedRunpodComputeProvider;

export function requireManagedComputeProvider() {
  requireManagedRunpodApiKey();
}

export function resolveComputeCompatibilityCloudType() {
  return resolveHostedRunpodCompatibilityCloudType();
}
