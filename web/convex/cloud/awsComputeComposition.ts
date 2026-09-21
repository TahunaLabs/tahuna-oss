import { getAwsGpuPricePerHour } from "@/cloud/providers/aws-compute-pricing";
import { createAwsComputeProvider } from "@convex/awsComputeProvider";

export const hostedAwsComputeProvider = createAwsComputeProvider({
  resolveGpuPricePerHour: getAwsGpuPricePerHour,
});
