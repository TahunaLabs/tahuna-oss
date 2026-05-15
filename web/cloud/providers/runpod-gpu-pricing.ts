export type RunpodGpuPricingRow = {
  gpuType: string;
  vramGb: number;
  ramGb: number;
  vcpus: number;
  pricePerHour: number;
};

const RUNPOD_GPU_PRICING_ROWS: RunpodGpuPricingRow[] = [
  { gpuType: "H200", vramGb: 141, ramGb: 276, vcpus: 24, pricePerHour: 4.79 },
  { gpuType: "B200", vramGb: 180, ramGb: 283, vcpus: 28, pricePerHour: 6.59 },
  { gpuType: "RTX Pro 6000", vramGb: 96, ramGb: 188, vcpus: 16, pricePerHour: 2.27 },
  { gpuType: "H100 NVL", vramGb: 94, ramGb: 94, vcpus: 16, pricePerHour: 3.68 },
  { gpuType: "H100 PCIe", vramGb: 80, ramGb: 188, vcpus: 16, pricePerHour: 2.87 },
  { gpuType: "H100 SXM", vramGb: 80, ramGb: 125, vcpus: 20, pricePerHour: 3.59 },
  { gpuType: "A100 PCIe", vramGb: 80, ramGb: 117, vcpus: 8, pricePerHour: 1.67 },
  { gpuType: "A100 SXM", vramGb: 80, ramGb: 125, vcpus: 16, pricePerHour: 1.79 },
  { gpuType: "L40S", vramGb: 48, ramGb: 94, vcpus: 16, pricePerHour: 1.03 },
  { gpuType: "RTX 6000 Ada", vramGb: 48, ramGb: 167, vcpus: 10, pricePerHour: 0.92 },
  { gpuType: "A40", vramGb: 48, ramGb: 50, vcpus: 9, pricePerHour: 0.53 },
  { gpuType: "L40", vramGb: 48, ramGb: 94, vcpus: 8, pricePerHour: 1.19 },
  { gpuType: "RTX A6000", vramGb: 48, ramGb: 50, vcpus: 9, pricePerHour: 0.59 },
  { gpuType: "RTX 5090", vramGb: 32, ramGb: 35, vcpus: 9, pricePerHour: 1.19 },
  { gpuType: "L4", vramGb: 24, ramGb: 50, vcpus: 12, pricePerHour: 0.47 },
  { gpuType: "RTX 3090", vramGb: 24, ramGb: 125, vcpus: 16, pricePerHour: 0.55 },
  { gpuType: "RTX 4090", vramGb: 24, ramGb: 41, vcpus: 6, pricePerHour: 0.83 },
  { gpuType: "RTX A5000", vramGb: 24, ramGb: 25, vcpus: 9, pricePerHour: 0.32 },
];

function normalizeGpuKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^nvidia\s+/, "")
    .replace(/^geforce\s+/, "")
    .replace(/\s+/g, " ");
}

const RUNPOD_GPU_PRICING_BY_KEY = new Map<string, number>(
  RUNPOD_GPU_PRICING_ROWS.map((row) => [normalizeGpuKey(row.gpuType), row.pricePerHour]),
);

export function getRunpodGpuPricePerHour(gpuType: string) {
  const normalized = normalizeGpuKey(gpuType);
  if (!normalized) {
    return undefined;
  }
  return RUNPOD_GPU_PRICING_BY_KEY.get(normalized);
}

export function getRunpodGpuPricePerHourCents(gpuType: string) {
  const pricePerHour = getRunpodGpuPricePerHour(gpuType);
  if (typeof pricePerHour !== "number") {
    return undefined;
  }
  return Math.round(pricePerHour * 100);
}

export function listRunpodGpuPricingRows() {
  return [...RUNPOD_GPU_PRICING_ROWS];
}
