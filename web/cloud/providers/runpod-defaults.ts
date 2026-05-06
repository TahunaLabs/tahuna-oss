export type RunpodCloudType = "COMMUNITY" | "SECURE";

export function resolveHostedRunpodCloudType(): RunpodCloudType {
  const cloudType = process.env.RUNPOD_CLOUD_TYPE?.trim().toUpperCase() || "SECURE";
  return cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE";
}
