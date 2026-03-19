import { BILLING_CONFIG } from "@/config";
import { getRunpodGpuPricePerHourCents } from "@/lib/runpod-gpu-pricing";

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
  if (gpuCount > 0 && typeof lookupGpuUnitHourlyRateCents !== "number") {
    const gpuType = (args.gpuType || "").trim();
    throw new Error(`gpu pricing not found for gpu_type "${gpuType || "unknown"}"`);
  }
  const resolvedGpuUnitHourlyRateCents = lookupGpuUnitHourlyRateCents ?? 0;
  const gpuUnitHourlyRateCents = gpuCount > 0 ? resolvedGpuUnitHourlyRateCents : 0;
  const gpuHourlyRateCents = gpuCount * gpuUnitHourlyRateCents;
  const volumeHourlyRateCents = volumeGb * BILLING_CONFIG.computeVolumeGbHourlyRateCents;
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
  return BILLING_CONFIG.minimumChargeCents;
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
  return Math.max(BILLING_CONFIG.minimumChargeCents, usageCents);
}
