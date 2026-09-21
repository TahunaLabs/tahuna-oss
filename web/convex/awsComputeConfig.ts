import { ConvexError } from "convex/values";
import { resolveAwsInstancePrices } from "@/lib/compute-provider-config";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new ConvexError({ detail: `${name} is required for AWS compute` });
  return value;
}

export function resolveAwsClientConfig() {
  return {
    region: requiredEnv("AWS_REGION"),
    credentials: {
      accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
      sessionToken: process.env.AWS_SESSION_TOKEN?.trim() || undefined,
    },
  };
}

export function resolveAwsComputeConfig() {
  const imageId = requiredEnv("TAHUNA_AWS_AMI_ID");
  const subnetId = requiredEnv("TAHUNA_AWS_SUBNET_ID");
  const securityGroupIds = requiredEnv("TAHUNA_AWS_SECURITY_GROUP_IDS").split(",").map((id) => id.trim());
  if (!/^ami-[a-f0-9]+$/.test(imageId) || !/^subnet-[a-f0-9]+$/.test(subnetId) ||
    securityGroupIds.some((id) => !/^sg-[a-f0-9]+$/.test(id))) {
    throw new ConvexError({ detail: "AWS compute requires valid AMI, subnet, and security group IDs" });
  }
  const publicIp = process.env.TAHUNA_AWS_PUBLIC_IP?.trim() || "false";
  if (publicIp !== "true" && publicIp !== "false") {
    throw new ConvexError({ detail: "TAHUNA_AWS_PUBLIC_IP must be true or false" });
  }
  return { imageId, subnetId, securityGroupIds, publicIp: publicIp === "true" };
}

export function requireAwsComputeProvider() {
  resolveAwsClientConfig();
  resolveAwsComputeConfig();
  resolveAwsInstancePrices();
}
