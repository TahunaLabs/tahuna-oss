export const GPU_CANONICAL_TYPES = [
  "H200",
  "H200 NVL",
  "H200 SXM",
  "B200",
  "B300",
  "RTX Pro 6000",
  "RTX Pro 6000 WK",
  "H100 NVL",
  "H100 PCIe",
  "H100 SXM",
  "A100 PCIe",
  "A100 SXM",
  "L40S",
  "RTX 6000 Ada",
  "A40",
  "L40",
  "RTX A6000",
  "RTX 5090",
  "RTX PRO 4500",
  "RTX 4090",
  "RTX 3090",
  "RTX A5000",
  "RTX A4500",
  "RTX 4000 Ada",
  "RTX A4000",
  "RTX 2000 Ada",
  "L4",
  "RTX PRO 4000",
  "MI300X",
] as const;

const CANONICAL_BY_KEY = new Map(GPU_CANONICAL_TYPES.map((t) => [t.toLowerCase(), t]));

export function resolveCanonicalGpuType(gpuType: string): string | undefined {
  return CANONICAL_BY_KEY.get(gpuType.trim().toLowerCase());
}
