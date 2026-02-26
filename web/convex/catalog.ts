import { query } from "./_generated/server";

export const images: Record<string, Record<string, string>> = {
  pt: {
    "2.8.0-cu128": "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404",
    "2.4.0-cu124": "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
    "2.2.0-cu121": "runpod/pytorch:2.2.0-py3.10-cuda12.1.1-devel-ubuntu22.04",
  },
};

export const gpus = [
  { id: "NVIDIA GeForce RTX 4090", displayName: "NVIDIA GeForce RTX 4090", memoryInGb: 24, maxGpuCount: 8 },
  { id: "NVIDIA A100 80GB PCIe", displayName: "NVIDIA A100 80GB PCIe", memoryInGb: 80, maxGpuCount: 8 },
  { id: "NVIDIA H100 PCIe", displayName: "NVIDIA H100 PCIe", memoryInGb: 80, maxGpuCount: 8 },
];

export const getCatalog = query({
  args: {},
  handler: async () => ({ gpus, images }),
});
