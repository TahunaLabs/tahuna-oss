import { action, query } from "@convex/_generated/server";
import { v } from "convex/values";

export const images: Record<string, Record<string, string>> = {
  pt: {
    "2.8.0-cu128": "runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404",
    "2.4.0-cu124": "runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04",
    "2.2.0-cu121": "runpod/pytorch:2.2.0-py3.10-cuda12.1.1-devel-ubuntu22.04",
  },
};

export const getCatalog = query({
  args: {},
  returns: v.object({
    images: v.record(v.string(), v.record(v.string(), v.string())),
  }),
  handler: async () => ({ images }),
});

type RunpodCloudPricing = {
  lowestPrice?: number | string | null;
  price?: number | string | null;
  pricePerGpu?: number | string | null;
  pricePerHr?: number | string | null;
  pricePerHour?: number | string | null;
  spotPrice?: number | string | null;
};

type RunpodGpuType = {
  id: string;
  displayName: string;
  memoryInGb: number;
  maxGpuCount?: number | null;
  secureCloud?: RunpodCloudPricing | null;
  communityCloud?: RunpodCloudPricing | null;
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

      const extractHourlyPrice = (cloud: RunpodCloudPricing | null | undefined): number | undefined => {
        if (!cloud || typeof cloud !== "object") return undefined;
        const candidates = [
          cloud.lowestPrice,
          cloud.price,
          cloud.pricePerGpu,
          cloud.pricePerHr,
          cloud.pricePerHour,
          cloud.spotPrice,
        ];

        for (const candidate of candidates) {
          if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
          if (typeof candidate === "string") {
            const parsed = Number.parseFloat(candidate);
            if (Number.isFinite(parsed)) return parsed;
          }
        }

        return undefined;
      };

      // Filter to only include GPUs that actually have stock and aren't 'unknown'
      const gpuTypes = json.data?.gpuTypes ?? [];
      const remoteGpus = gpuTypes
        .filter((g) => g.id !== "unknown" && (g.secureCloud || g.communityCloud))
        .map((g) => ({
          id: g.id,
          displayName: g.displayName,
          memoryInGb: g.memoryInGb,
          maxGpuCount: g.maxGpuCount || 1,
          pricePerHour: extractHourlyPrice(g.communityCloud) ?? extractHourlyPrice(g.secureCloud),
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
