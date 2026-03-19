import { action, query } from "@convex/_generated/server";
import { v } from "convex/values";
import runtimeImageBases from "@/convex/runtime-images.json";
import { getRunpodGpuPricePerHour } from "@/lib/runpod-gpu-pricing";

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

type RunpodGpuType = {
  id: string;
  displayName: string;
  memoryInGb: number;
  maxGpuCount?: number | null;
  secureCloud?: Record<string, unknown> | null;
  communityCloud?: Record<string, unknown> | null;
};

type RunpodGraphqlResponse = {
  data?: {
    gpuTypes?: RunpodGpuType[];
  };
  errors?: unknown;
};

export const getDynamicGpus = action({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      displayName: v.string(),
      memoryInGb: v.number(),
      maxGpuCount: v.number(),
      pricePerHour: v.optional(v.number()),
    }),
  ),
  handler: async () => {
    const apiKey = process.env.RUNPOD_API_KEY;
    if (!apiKey) {
      return [];
    }

    try {
      // The runpod-sdk graphql implementation might be tricky if not documented well.
      // We can directly call the GraphQL endpoint via native fetch using the key to be perfectly safe,
      // as we know exactly what we need from our earlier curl test.
      const res = await fetch("https://api.runpod.io/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: "query { gpuTypes { id displayName memoryInGb maxGpuCount secureCloud communityCloud } }"
        }),
      });

      if (!res.ok) {
         return [];
      }

      const json = (await res.json()) as RunpodGraphqlResponse;
      if (json.errors) {
        return [];
      }

      // Filter to only include GPUs that actually have stock and aren't 'unknown'
      const gpuTypes = json.data?.gpuTypes ?? [];
      const remoteGpus = gpuTypes
        .filter((g) => g.id !== "unknown" && (g.secureCloud || g.communityCloud))
        .map((g) => ({
          id: g.id,
          displayName: g.displayName,
          memoryInGb: g.memoryInGb,
          maxGpuCount: g.maxGpuCount || 1,
          pricePerHour: getRunpodGpuPricePerHour(g.displayName) ?? getRunpodGpuPricePerHour(g.id),
        }));

      // Sort by memory size descending, then alphabetically by name to present nice options
      remoteGpus.sort((a, b) => {
        if (b.memoryInGb !== a.memoryInGb) {
          return b.memoryInGb - a.memoryInGb;
        }
        return a.displayName.localeCompare(b.displayName);
      });

      return remoteGpus;

    } catch {
       return [];
    }
  },
});
