export type RunpodGpuPricingRow = {
  gpuType: string;
  pricePerHour: number;
};

const RUNPOD_GPU_PRICING_ROWS: RunpodGpuPricingRow[] = [
  { gpuType: "RTX 5090", pricePerHour: 0.89 },
  { gpuType: "A40", pricePerHour: 0.4 },
  { gpuType: "H200 SXM", pricePerHour: 3.59 },
  { gpuType: "B200", pricePerHour: 4.99 },
  { gpuType: "RTX 2000 Ada", pricePerHour: 0.24 },
  { gpuType: "RTX 4000 Ada", pricePerHour: 0.26 },
  { gpuType: "RTX 4090", pricePerHour: 0.59 },
  { gpuType: "L4", pricePerHour: 0.39 },
  { gpuType: "RTX PRO 4500", pricePerHour: 0.54 },
  { gpuType: "L40", pricePerHour: 0.99 },
  { gpuType: "L40S", pricePerHour: 0.86 },
  { gpuType: "RTX 6000 Ada", pricePerHour: 0.77 },
  { gpuType: "H100 SXM", pricePerHour: 2.69 },
  { gpuType: "H100 PCIe", pricePerHour: 2.39 },
  { gpuType: "H100 NVL", pricePerHour: 3.07 },
  { gpuType: "RTX PRO 6000", pricePerHour: 1.69 },
  { gpuType: "RTX PRO 6000 WK", pricePerHour: 1.89 },
  { gpuType: "NVIDIA H200 NVL", pricePerHour: 3.39 },
  { gpuType: "RTX A4000", pricePerHour: 0.25 },
  { gpuType: "RTX A4500", pricePerHour: 0.25 },
  { gpuType: "RTX 3090", pricePerHour: 0.46 },
  { gpuType: "RTX 3070", pricePerHour: 0.24 },
  { gpuType: "RTX A5000", pricePerHour: 0.27 },
  { gpuType: "RTX A6000", pricePerHour: 0.49 },
  { gpuType: "A100 PCIe", pricePerHour: 1.39 },
  { gpuType: "A100 SXM", pricePerHour: 1.49 },
  { gpuType: "MI300X", pricePerHour: 1.99 },
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
