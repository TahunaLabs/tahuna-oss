import { resolveHostedRunpodCloudType } from "@/cloud/providers/runpod-defaults";
import { getRunpodGpuPricePerHour, resolveCanonicalFromRunpodName } from "@/cloud/providers/runpod-gpu-pricing";
import {
  createRunpodComputeProvider,
  resolveRunpodCompatibilityCloudType,
} from "@convex/runpodComputeProvider";

export const hostedRunpodComputeProvider = createRunpodComputeProvider({
  resolveCloudType: resolveHostedRunpodCloudType,
  resolveGpuPricePerHour: getRunpodGpuPricePerHour,
  resolveCanonicalGpuName: resolveCanonicalFromRunpodName,
});

export function resolveHostedRunpodCompatibilityCloudType() {
  return resolveRunpodCompatibilityCloudType({
    resolveCloudType: resolveHostedRunpodCloudType,
  });
}
