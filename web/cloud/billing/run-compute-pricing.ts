import { CLOUD_BILLING_CONFIG } from "@/cloud/config";
import { getRunpodGpuPricePerHourCents } from "@/cloud/providers/runpod-gpu-pricing";

const HOURS_PER_MONTH = 730;

export type RunComputePricing = {
  gpuCount: number;
  volumeGb: number;
  gpuUnitHourlyRateCents: number;
  gpuHourlyRateCents: number;
  volumeHourlyRateCents: number;
  hourlyRateCents: number;
};

function safePositiveNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

export function resolveRunComputePricing(args: {
  gpuType: string | undefined;
  gpuCount: number | undefined;
  volumeGb: number | undefined;
}): RunComputePricing {
  const gpuCount = safePositiveNumber(args.gpuCount);
  const volumeGb = safePositiveNumber(args.volumeGb);
  const lookupGpuUnitHourlyRateCents = getRunpodGpuPricePerHourCents(args.gpuType || "");
  let gpuUnitHourlyRateCents = 0;
  if (gpuCount > 0) {
    if (typeof lookupGpuUnitHourlyRateCents !== "number") {
      const gpuType = args.gpuType?.trim() || "(empty)";
      throw new Error(`gpu pricing not configured for GPU type: ${gpuType}`);
    }
    gpuUnitHourlyRateCents = lookupGpuUnitHourlyRateCents;
  }
  const gpuHourlyRateCents = gpuCount * gpuUnitHourlyRateCents;
  const volumeHourlyRateCents =
    (volumeGb * CLOUD_BILLING_CONFIG.computeVolumeGbMonthlyRateCents) / HOURS_PER_MONTH;
  return {
    gpuCount,
    volumeGb,
    gpuUnitHourlyRateCents,
    gpuHourlyRateCents,
    volumeHourlyRateCents,
    hourlyRateCents: gpuHourlyRateCents + volumeHourlyRateCents,
  };
}

export function estimateRunReservationCents(args: {
  gpuType: string | undefined;
  gpuCount: number | undefined;
  volumeGb: number | undefined;
}) {
  const pricing = resolveRunComputePricing(args);
  if (pricing.hourlyRateCents <= 0) {
    return 0;
  }
  return CLOUD_BILLING_CONFIG.minimumChargeCents;
}

export function estimateRunLaunchCents(args: {
  gpuType: string | undefined;
  gpuCount: number | undefined;
  volumeGb: number | undefined;
}) {
  const pricing = resolveRunComputePricing(args);
  if (pricing.hourlyRateCents <= 0) {
    return 0;
  }
  return Math.max(
    CLOUD_BILLING_CONFIG.minimumChargeCents,
    Math.ceil(pricing.hourlyRateCents * CLOUD_BILLING_CONFIG.runLaunchEstimateHours),
  );
}

export function estimateRunUsageCents(args: {
  gpuType: string | undefined;
  gpuCount: number | undefined;
  volumeGb: number | undefined;
  durationMs: number | undefined;
}) {
  const pricing = resolveRunComputePricing(args);
  const durationMs = safePositiveNumber(args.durationMs);
  if (durationMs <= 0) {
    return 0;
  }
  const usageCents = Math.ceil((pricing.hourlyRateCents * durationMs) / (60 * 60 * 1000));
  return Math.max(CLOUD_BILLING_CONFIG.minimumChargeCents, usageCents);
}
