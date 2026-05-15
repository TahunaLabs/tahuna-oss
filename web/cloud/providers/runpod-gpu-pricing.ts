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

const RUNPOD_COMPUTE_PRICE_MARKUP_MULTIPLIER = 1.2;

function applyRunpodComputePriceMarkup(pricePerHour: number) {
  return Math.round(pricePerHour * RUNPOD_COMPUTE_PRICE_MARKUP_MULTIPLIER * 100) / 100;
}

function normalizeGpuKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^nvidia\s+/, "")
    .replace(/^geforce\s+/, "")
    .replace(/\s+/g, " ");
}

const RUNPOD_GPU_PRICING_BY_KEY = new Map<string, number>(
  RUNPOD_GPU_PRICING_ROWS.map((row) => [
    normalizeGpuKey(row.gpuType),
    applyRunpodComputePriceMarkup(row.pricePerHour),
  ]),
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
  return RUNPOD_GPU_PRICING_ROWS.map((row) => ({
    ...row,
    pricePerHour: applyRunpodComputePriceMarkup(row.pricePerHour),
  }));
}
