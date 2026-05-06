import { resolveHostedRunpodCloudType } from "@/cloud/providers/runpod-defaults";
import { getRunpodGpuPricePerHour } from "@/cloud/providers/runpod-gpu-pricing";
import {
  createRunpodComputeProvider,
  resolveRunpodCompatibilityCloudType,
} from "@convex/runpodComputeProvider";

export const hostedRunpodComputeProvider = createRunpodComputeProvider({
  resolveCloudType: resolveHostedRunpodCloudType,
  resolveGpuPricePerHour: getRunpodGpuPricePerHour,
});

export function resolveHostedRunpodCompatibilityCloudType() {
  return resolveRunpodCompatibilityCloudType({
    resolveCloudType: resolveHostedRunpodCloudType,
  });
}
