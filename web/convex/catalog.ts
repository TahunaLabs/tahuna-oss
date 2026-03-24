import { internalAction, query } from "@convex/_generated/server";
import { v } from "convex/values";
import runtimeImageBases from "@/convex/runtime-images.json";
import { getRunpodGpuPricePerHour } from "@/lib/runpod-gpu-pricing";
import { fetchRunpodGpuTypes, resolveActiveRunpodApiKeyForUserId } from "@convex/runpodCredentials";

const MANAGED_RUNTIME_IMAGE_REPO = (
  process.env.TAHUNA_RUNTIME_IMAGE_REPO?.trim() ||
  "docker.io/pazuzzu/tahuna"
).replace(/\/+$/, "");

type RuntimeVersionEntry = { base: string; python: string[] };
type RuntimeImageSpec = Record<string, Record<string, RuntimeVersionEntry>>;

// images[framework][version][pythonVersion] = full image URL
export const images: Record<string, Record<string, Record<string, string>>> = (() => {
  const spec = runtimeImageBases as RuntimeImageSpec;
  const out: Record<string, Record<string, Record<string, string>>> = {};
  for (const [framework, versions] of Object.entries(spec)) {
    out[framework] = {};
    for (const [version, entry] of Object.entries(versions)) {
      out[framework][version] = {};
      for (const python of entry.python) {
        const tag = `${framework}-${version}-py${python}`;
        out[framework][version][python] = `${MANAGED_RUNTIME_IMAGE_REPO}:${tag}`;
      }
    }
  }
  return out;
})();

export const getCatalog = query({
  args: {},
  returns: v.object({
    images: v.record(v.string(), v.record(v.string(), v.record(v.string(), v.string()))),
  }),
  handler: async () => ({ images }),
});

export const getDynamicGpus = internalAction({
  args: {
    userId: v.string(),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      displayName: v.string(),
      memoryInGb: v.number(),
      maxGpuCount: v.number(),
      pricePerHour: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const { apiKey } = await resolveActiveRunpodApiKeyForUserId(ctx, args.userId);
    const gpuTypes = await fetchRunpodGpuTypes(apiKey);
    const remoteGpus = gpuTypes
      .filter((g) => g.id && g.id !== "unknown" && (g.secureCloud || g.communityCloud))
      .map((g) => ({
        id: g.id || "",
        displayName: g.displayName || g.id || "",
        memoryInGb: Number.isFinite(g.memoryInGb) ? g.memoryInGb || 0 : 0,
        maxGpuCount: g.maxGpuCount || 1,
        pricePerHour: getRunpodGpuPricePerHour(g.displayName || "") ?? getRunpodGpuPricePerHour(g.id || ""),
      }));

    // Sort by memory size descending, then alphabetically by name to present nice options.
    remoteGpus.sort((a, b) => {
      if (b.memoryInGb !== a.memoryInGb) {
        return b.memoryInGb - a.memoryInGb;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    return remoteGpus;
  },
});
