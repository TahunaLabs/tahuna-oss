import { CLOUD_BILLING_CONFIG } from "@/cloud/config";
import { resolveCanonicalGpuType } from "@/cloud/gpu-catalog";

export type RunpodGpuPricingRow = {
  gpuType: string;
  vramGb: number;
  ramGb: number;
  vcpus: number;
  pricePerHour: number;
};

// Canonical GPU types with RunPod-specific pod specs and pricing.
const RUNPOD_GPU_PRICING_ROWS: RunpodGpuPricingRow[] = [
  { gpuType: "H200",         vramGb: 141, ramGb: 276, vcpus: 24, pricePerHour: 3.99 },
  { gpuType: "B200",         vramGb: 180, ramGb: 283, vcpus: 28, pricePerHour: 5.49 },
  { gpuType: "RTX Pro 6000", vramGb: 96,  ramGb: 188, vcpus: 16, pricePerHour: 1.89 },
  { gpuType: "H100 NVL",     vramGb: 94,  ramGb: 94,  vcpus: 16, pricePerHour: 3.07 },
  { gpuType: "H100 PCIe",    vramGb: 80,  ramGb: 188, vcpus: 16, pricePerHour: 2.39 },
  { gpuType: "H100 SXM",     vramGb: 80,  ramGb: 125, vcpus: 20, pricePerHour: 2.99 },
  { gpuType: "A100 PCIe",    vramGb: 80,  ramGb: 117, vcpus: 8,  pricePerHour: 1.39 },
  { gpuType: "A100 SXM",     vramGb: 80,  ramGb: 125, vcpus: 16, pricePerHour: 1.49 },
  { gpuType: "L40S",         vramGb: 48,  ramGb: 94,  vcpus: 16, pricePerHour: 0.86 },
  { gpuType: "RTX 6000 Ada", vramGb: 48,  ramGb: 167, vcpus: 10, pricePerHour: 0.77 },
  { gpuType: "A40",          vramGb: 48,  ramGb: 50,  vcpus: 9,  pricePerHour: 0.44 },
  { gpuType: "L40",          vramGb: 48,  ramGb: 94,  vcpus: 8,  pricePerHour: 0.99 },
  { gpuType: "RTX A6000",    vramGb: 48,  ramGb: 50,  vcpus: 9,  pricePerHour: 0.49 },
  { gpuType: "RTX 5090",     vramGb: 32,  ramGb: 35,  vcpus: 9,  pricePerHour: 0.99 },
  { gpuType: "L4",           vramGb: 24,  ramGb: 50,  vcpus: 12, pricePerHour: 0.39 },
  { gpuType: "RTX 3090",     vramGb: 24,  ramGb: 125, vcpus: 16, pricePerHour: 0.46 },
  { gpuType: "RTX 4090",     vramGb: 24,  ramGb: 41,  vcpus: 6,  pricePerHour: 0.69 },
  { gpuType: "RTX A5000",    vramGb: 24,  ramGb: 25,  vcpus: 9,  pricePerHour: 0.27 },
];

// Maps RunPod API display names → canonical gpuType keys.
// RunPod returns verbose names like "NVIDIA A100 80GB PCIe"; we translate them here.
// Add an entry when RunPod returns a name that doesn't already match a canonical type.
const RUNPOD_API_TO_CANONICAL: Record<string, string> = {
  "NVIDIA H200":              "H200",
  "NVIDIA B200":              "B200",
  "NVIDIA RTX Pro 6000":      "RTX Pro 6000",
  "NVIDIA H100 NVL":          "H100 NVL",
  "NVIDIA H100 PCIe":         "H100 PCIe",
  "NVIDIA H100 SXM":          "H100 SXM",
  "NVIDIA A100 80GB PCIe":    "A100 PCIe",
  "NVIDIA A100 SXM":          "A100 SXM",
  "NVIDIA L40S":              "L40S",
  "NVIDIA RTX 6000 Ada":      "RTX 6000 Ada",
  "NVIDIA A40":               "A40",
  "NVIDIA L40":               "L40",
  "NVIDIA RTX A6000":         "RTX A6000",
  "NVIDIA GeForce RTX 5090":  "RTX 5090",
  "NVIDIA L4":                "L4",
  "NVIDIA GeForce RTX 3090":  "RTX 3090",
  "NVIDIA GeForce RTX 4090":  "RTX 4090",
  "NVIDIA RTX A5000":         "RTX A5000",
};

function applyRunpodComputePriceMarkup(pricePerHour: number) {
  return Math.round(pricePerHour * CLOUD_BILLING_CONFIG.computePriceMarkupMultiplier * 100) / 100;
}

// Keyed by lowercase canonical name for case-insensitive lookup.
const RUNPOD_GPU_PRICING_BY_KEY = new Map<string, number>(
  RUNPOD_GPU_PRICING_ROWS.map((row) => [
    row.gpuType.toLowerCase(),
    applyRunpodComputePriceMarkup(row.pricePerHour),
  ]),
);

// Resolves a RunPod API display name to a canonical GPU type.
// Falls back to direct canonical lookup so user-typed names also resolve.
export function resolveCanonicalFromRunpodName(runpodDisplayName: string): string | undefined {
  const trimmed = runpodDisplayName.trim();
  return RUNPOD_API_TO_CANONICAL[trimmed] ?? resolveCanonicalGpuType(trimmed);
}

export function getRunpodGpuPricePerHour(gpuType: string): number | undefined {
  const canonical = resolveCanonicalFromRunpodName(gpuType);
  if (!canonical) {
    return undefined;
  }
  return RUNPOD_GPU_PRICING_BY_KEY.get(canonical.toLowerCase());
}

export function getRunpodGpuPricePerHourCents(gpuType: string): number | undefined {
  const pricePerHour = getRunpodGpuPricePerHour(gpuType);
  if (typeof pricePerHour !== "number") {
    return undefined;
  }
  return Math.round(pricePerHour * 100);
}

export function listRunpodGpuPricingRows(): RunpodGpuPricingRow[] {
  return RUNPOD_GPU_PRICING_ROWS.map((row) => ({
    ...row,
    pricePerHour: applyRunpodComputePriceMarkup(row.pricePerHour),
  }));
}
