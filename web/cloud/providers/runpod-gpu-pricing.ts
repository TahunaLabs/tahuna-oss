import { CLOUD_BILLING_CONFIG } from "@/cloud/config";

export type RunpodGpuPricingRow = {
  gpuType: string;
  vramGb: number;
  ramGb: number;
  vcpus: number;
  pricePerHour: number;
};

const RUNPOD_GPU_PRICING_ROWS: RunpodGpuPricingRow[] = [
  { gpuType: "H200", vramGb: 141, ramGb: 276, vcpus: 24, pricePerHour: 3.99 },
  { gpuType: "B200", vramGb: 180, ramGb: 283, vcpus: 28, pricePerHour: 5.49 },
  { gpuType: "RTX Pro 6000", vramGb: 96, ramGb: 188, vcpus: 16, pricePerHour: 1.89 },
  { gpuType: "H100 NVL", vramGb: 94, ramGb: 94, vcpus: 16, pricePerHour: 3.07 },
  { gpuType: "H100 PCIe", vramGb: 80, ramGb: 188, vcpus: 16, pricePerHour: 2.39 },
  { gpuType: "H100 SXM", vramGb: 80, ramGb: 125, vcpus: 20, pricePerHour: 2.99 },
  { gpuType: "A100 PCIe", vramGb: 80, ramGb: 117, vcpus: 8, pricePerHour: 1.39 },
  { gpuType: "A100 SXM", vramGb: 80, ramGb: 125, vcpus: 16, pricePerHour: 1.49 },
  { gpuType: "L40S", vramGb: 48, ramGb: 94, vcpus: 16, pricePerHour: 0.86 },
  { gpuType: "RTX 6000 Ada", vramGb: 48, ramGb: 167, vcpus: 10, pricePerHour: 0.77 },
  { gpuType: "A40", vramGb: 48, ramGb: 50, vcpus: 9, pricePerHour: 0.44 },
  { gpuType: "L40", vramGb: 48, ramGb: 94, vcpus: 8, pricePerHour: 0.99 },
  { gpuType: "RTX A6000", vramGb: 48, ramGb: 50, vcpus: 9, pricePerHour: 0.49 },
  { gpuType: "RTX 5090", vramGb: 32, ramGb: 35, vcpus: 9, pricePerHour: 0.99 },
  { gpuType: "L4", vramGb: 24, ramGb: 50, vcpus: 12, pricePerHour: 0.39 },
  { gpuType: "RTX 3090", vramGb: 24, ramGb: 125, vcpus: 16, pricePerHour: 0.46 },
  { gpuType: "RTX 4090", vramGb: 24, ramGb: 41, vcpus: 6, pricePerHour: 0.69 },
  { gpuType: "RTX A5000", vramGb: 24, ramGb: 25, vcpus: 9, pricePerHour: 0.27 },
];

// Maps RunPod display names (as returned by their API) to our canonical gpuType keys.
// When RunPod returns a new GPU name that doesn't match, add an entry here.
const RUNPOD_GPU_NAME_MAP: Record<string, string> = {
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

const RUNPOD_GPU_PRICING_BY_KEY = new Map<string, number>(
  RUNPOD_GPU_PRICING_ROWS.map((row) => [
    row.gpuType,
    applyRunpodComputePriceMarkup(row.pricePerHour),
  ]),
);

export function getRunpodGpuPricePerHour(gpuType: string) {
  const canonical = RUNPOD_GPU_NAME_MAP[gpuType.trim()];
  if (!canonical) {
    return undefined;
  }
  return RUNPOD_GPU_PRICING_BY_KEY.get(canonical);
}

export function getRunpodGpuPricePerHourCents(gpuType: string) {
  const pricePerHour = getRunpodGpuPricePerHour(gpuType);
  if (typeof pricePerHour !== "number") {
    return undefined;
  }
  return Math.round(pricePerHour * 100);
}

export function listRunpodGpuPricingRows() {
  return RUNPOD_GPU_PRICING_ROWS.map((row) => ({
    ...row,
    pricePerHour: applyRunpodComputePriceMarkup(row.pricePerHour),
  }));
}
