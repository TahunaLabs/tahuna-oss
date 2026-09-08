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
  { gpuType: "H100 SXM",       vramGb: 80,  ramGb: 251, vcpus: 26, pricePerHour: 3.29 },
  { gpuType: "RTX PRO 6000",   vramGb: 96,  ramGb: 188, vcpus: 16, pricePerHour: 2.09 },
  { gpuType: "H200 SXM",       vramGb: 141, ramGb: 188, vcpus: 20, pricePerHour: 4.39 },
  { gpuType: "B200",           vramGb: 180, ramGb: 251, vcpus: 24, pricePerHour: 5.89 },
  { gpuType: "RTX 4000 Ada",   vramGb: 20,  ramGb: 50,  vcpus: 8,  pricePerHour: 0.26 },
  { gpuType: "RTX 4090",       vramGb: 24,  ramGb: 41,  vcpus: 8,  pricePerHour: 0.69 },
  { gpuType: "RTX 5090",       vramGb: 32,  ramGb: 93,  vcpus: 16, pricePerHour: 0.99 },
  { gpuType: "RTX PRO 4500",   vramGb: 32,  ramGb: 62,  vcpus: 28, pricePerHour: 0.74 },
  { gpuType: "L40S",           vramGb: 48,  ramGb: 188, vcpus: 16, pricePerHour: 0.86 },
  { gpuType: "H100 PCIe",      vramGb: 80,  ramGb: 188, vcpus: 16, pricePerHour: 2.89 },
  { gpuType: "H100 NVL",       vramGb: 94,  ramGb: 94,  vcpus: 16, pricePerHour: 3.19 },
  { gpuType: "RTX PRO 6000 WK",vramGb: 96,  ramGb: 188, vcpus: 16, pricePerHour: 1.89 },
  { gpuType: "H200 NVL",       vramGb: 143, ramGb: 276, vcpus: 24, pricePerHour: 3.79 },
  { gpuType: "B300",           vramGb: 288, ramGb: 283, vcpus: 28, pricePerHour: 7.39 },
  { gpuType: "RTX 2000 Ada",   vramGb: 16,  ramGb: 31,  vcpus: 6,  pricePerHour: 0.24 },
  { gpuType: "RTX A4000",      vramGb: 16,  ramGb: 50,  vcpus: 8,  pricePerHour: 0.25 },
  { gpuType: "RTX A4500",      vramGb: 20,  ramGb: 50,  vcpus: 9,  pricePerHour: 0.25 },
  { gpuType: "RTX 3090",       vramGb: 24,  ramGb: 125, vcpus: 32, pricePerHour: 0.46 },
  { gpuType: "L4",             vramGb: 24,  ramGb: 50,  vcpus: 10, pricePerHour: 0.39 },
  { gpuType: "RTX A5000",      vramGb: 24,  ramGb: 50,  vcpus: 9,  pricePerHour: 0.27 },
  { gpuType: "RTX PRO 4000",   vramGb: 24,  ramGb: 31,  vcpus: 12, pricePerHour: 0.57 },
  { gpuType: "A40",            vramGb: 48,  ramGb: 50,  vcpus: 9,  pricePerHour: 0.44 },
  { gpuType: "L40",            vramGb: 48,  ramGb: 94,  vcpus: 8,  pricePerHour: 0.82 },
  { gpuType: "RTX 6000 Ada",   vramGb: 48,  ramGb: 62,  vcpus: 16, pricePerHour: 0.77 },
  { gpuType: "RTX A6000",      vramGb: 48,  ramGb: 50,  vcpus: 9,  pricePerHour: 0.49 },
  { gpuType: "A100 PCIe",      vramGb: 80,  ramGb: 117, vcpus: 8,  pricePerHour: 1.39 },
  { gpuType: "A100 SXM",       vramGb: 80,  ramGb: 117, vcpus: 8,  pricePerHour: 1.49 },
  { gpuType: "MI300X",         vramGb: 128, ramGb: 256, vcpus: 32, pricePerHour: 1.99 },
];

// Maps RunPod API display names → canonical gpuType keys.
// RunPod returns verbose names like "NVIDIA A100 80GB PCIe"; we translate them here.
// Add an entry when RunPod returns a name that doesn't already match a canonical type.
const RUNPOD_API_TO_CANONICAL: Record<string, string> = {
  "NVIDIA H100 SXM":          "H100 SXM",
  "NVIDIA RTX Pro 6000":      "RTX PRO 6000",
  "NVIDIA H200 SXM":          "H200 SXM",
  "NVIDIA B200":              "B200",
  "NVIDIA RTX 4000 Ada":      "RTX 4000 Ada",
  "NVIDIA GeForce RTX 4090":  "RTX 4090",
  "NVIDIA GeForce RTX 5090":  "RTX 5090",
  "NVIDIA RTX PRO 4500":      "RTX PRO 4500",
  "NVIDIA L40S":              "L40S",
  "NVIDIA H100 PCIe":         "H100 PCIe",
  "NVIDIA H100 NVL":          "H100 NVL",
  "NVIDIA RTX Pro 6000 WK":   "RTX PRO 6000 WK",
  "NVIDIA H200 NVL":          "H200 NVL",
  "NVIDIA B300":              "B300",
  "NVIDIA RTX 2000 Ada":      "RTX 2000 Ada",
  "NVIDIA RTX A4000":         "RTX A4000",
  "NVIDIA RTX A4500":         "RTX A4500",
  "NVIDIA GeForce RTX 3090":  "RTX 3090",
  "NVIDIA L4":                "L4",
  "NVIDIA RTX A5000":         "RTX A5000",
  "NVIDIA RTX PRO 4000":      "RTX PRO 4000",
  "NVIDIA A40":               "A40",
  "NVIDIA L40":               "L40",
  "NVIDIA RTX 6000 Ada":      "RTX 6000 Ada",
  "NVIDIA RTX A6000":         "RTX A6000",
  "NVIDIA A100 80GB PCIe":    "A100 PCIe",
  "NVIDIA A100 80GB SXM":     "A100 SXM",
  "NVIDIA MI300X":            "MI300X",
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
