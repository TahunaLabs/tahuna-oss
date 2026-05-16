export const GPU_CANONICAL_TYPES = [
  "H200",
  "B200",
  "RTX Pro 6000",
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
  "L4",
  "RTX 3090",
  "RTX 4090",
  "RTX A5000",
] as const;

const CANONICAL_BY_KEY = new Map(GPU_CANONICAL_TYPES.map((t) => [t.toLowerCase(), t]));

export function resolveCanonicalGpuType(gpuType: string): string | undefined {
  return CANONICAL_BY_KEY.get(gpuType.trim().toLowerCase());
}
