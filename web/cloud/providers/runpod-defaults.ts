import { RUNPOD_CONFIG } from "@/config";

export type RunpodCloudType = "COMMUNITY" | "SECURE";

export function resolveHostedRunpodCloudType(): RunpodCloudType {
  const cloudType = RUNPOD_CONFIG.defaultCloudType;
  return cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE";
}
