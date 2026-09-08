export const GPU_CANONICAL_TYPES = [
  "H100 SXM",
  "RTX PRO 6000",
  "H200 SXM",
  "B200",
  "RTX 4000 Ada",
  "RTX 4090",
  "RTX 5090",
  "RTX PRO 4500",
  "L40S",
  "H100 PCIe",
  "H100 NVL",
  "RTX PRO 6000 WK",
  "H200 NVL",
  "B300",
  "RTX 2000 Ada",
  "RTX A4000",
  "RTX A4500",
  "RTX 3090",
  "L4",
  "RTX A5000",
  "RTX PRO 4000",
  "A40",
  "L40",
  "RTX 6000 Ada",
  "RTX A6000",
  "A100 PCIe",
  "A100 SXM",
  "MI300X"
] as const;

const CANONICAL_BY_KEY = new Map(GPU_CANONICAL_TYPES.map((t) => [t.toLowerCase(), t]));

export function resolveCanonicalGpuType(gpuType: string): string | undefined {
  return CANONICAL_BY_KEY.get(gpuType.trim().toLowerCase());
}
