import type { ComputeProvider } from "@convex/core/compute";
import {
  hostedRunpodComputeProvider,
  resolveHostedRunpodCompatibilityCloudType,
} from "@convex/cloud/runpodComputeComposition";
import { requireManagedRunpodApiKey } from "@convex/runpodCredentialSecrets";
import { hostedAwsComputeProvider } from "@convex/cloud/awsComputeComposition";
import { requireAwsComputeProvider } from "@convex/awsComputeConfig";
import { resolveComputeProviderName } from "@/lib/compute-provider-config";

export type { ComputeProvider } from "@convex/core/compute";

export const computeProvider: ComputeProvider = resolveComputeProviderName() === "aws"
  ? hostedAwsComputeProvider
  : hostedRunpodComputeProvider;

export function requireManagedComputeProvider() {
  if (resolveComputeProviderName() === "aws") requireAwsComputeProvider();
  else requireManagedRunpodApiKey();
}

export function resolveComputeCompatibilityCloudType() {
  if (resolveComputeProviderName() === "aws") return `aws:${process.env.AWS_REGION?.trim()}`;
  return resolveHostedRunpodCompatibilityCloudType();
}
