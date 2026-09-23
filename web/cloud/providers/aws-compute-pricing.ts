import { CLOUD_BILLING_CONFIG } from "@/cloud/config";
import { resolveAwsInstancePrice } from "@/lib/compute-provider-config";

export function getAwsGpuPricePerHour(instanceType: string, gpuCount: number) {
  return resolveAwsInstancePrice(instanceType) * CLOUD_BILLING_CONFIG.computePriceMarkupMultiplier / gpuCount;
}
