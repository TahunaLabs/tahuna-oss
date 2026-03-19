import { BILLING_CONFIG } from "@/config";
import { getRunpodGpuPricePerHourCents } from "@/lib/runpod-gpu-pricing";

export type RunComputePricing = {
  gpuCount: number;
  volumeGb: number;
  gpuUnitHourlyRateCents: number;
  gpuHourlyRateCents: number;
  volumeHourlyRateCents: number;
  hourlyRateCents: number;
  usedFallbackGpuRate: boolean;
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
  const resolvedGpuUnitHourlyRateCents =
    lookupGpuUnitHourlyRateCents ?? BILLING_CONFIG.defaultComputeGpuHourlyRateCents;
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
    usedFallbackGpuRate: gpuCount > 0 && lookupGpuUnitHourlyRateCents === undefined,
  };
}

export function estimateRunReservationCents(args: {
  gpuType: string | undefined;
  gpuCount: number | undefined;
  volumeGb: number | undefined;
}) {
  const pricing = resolveRunComputePricing(args);
  const reservationCents = Math.ceil(pricing.hourlyRateCents * BILLING_CONFIG.computeReservationHours);
  return Math.max(BILLING_CONFIG.minimumChargeCents, reservationCents);
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
