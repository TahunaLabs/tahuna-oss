import { ConvexError } from "convex/values";

export function resolveComputeProviderName(): "runpod" | "aws" {
  const provider = process.env.TAHUNA_COMPUTE_PROVIDER?.trim() || "runpod";
  if (provider !== "runpod" && provider !== "aws") {
    throw new ConvexError({ detail: "TAHUNA_COMPUTE_PROVIDER must be runpod or aws" });
  }
  return provider;
}

// Whole-instance USD/hour prices, configured for the deployment's AWS region.
// This also acts as the operator's allowlist of EC2 instance types.
export function resolveAwsInstancePrices(): Record<string, number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(process.env.TAHUNA_AWS_INSTANCE_PRICES?.trim() || "");
  } catch {
    throw new ConvexError({ detail: "TAHUNA_AWS_INSTANCE_PRICES must be a JSON object of instance types and USD/hour prices" });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ConvexError({ detail: "TAHUNA_AWS_INSTANCE_PRICES must be a JSON object" });
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > 100) {
    throw new ConvexError({ detail: "TAHUNA_AWS_INSTANCE_PRICES must configure between 1 and 100 instance types" });
  }
  for (const [instanceType, price] of entries) {
    if (!/^[a-z][a-z0-9-]*\.[a-z0-9]+$/.test(instanceType) || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      throw new ConvexError({ detail: "TAHUNA_AWS_INSTANCE_PRICES entries must have an EC2 instance type and a positive USD/hour price" });
    }
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

export function resolveAwsInstancePrice(instanceType: string): number {
  const price = resolveAwsInstancePrices()[instanceType];
  if (typeof price !== "number") {
    throw new ConvexError({ detail: `AWS instance type is not configured: ${instanceType}` });
  }
  return price;
}

export function resolveAwsVolumeGbMonthlyPrice() {
  const price = Number(process.env.TAHUNA_AWS_VOLUME_GB_MONTHLY_PRICE?.trim());
  if (!Number.isFinite(price) || price <= 0) {
    throw new ConvexError({ detail: "TAHUNA_AWS_VOLUME_GB_MONTHLY_PRICE must be a positive USD/GiB-month price for gp3 storage" });
  }
  return price;
}
