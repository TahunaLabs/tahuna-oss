import { internalMutation, mutation, query, type MutationCtx } from "@convex/_generated/server";
import { v } from "convex/values";
import { requireUser } from "@convex/auth";

const RUNPOD_PROVIDER = "runpod";
const RUNPOD_SCREENSHOT_SOURCE = "runpod_pricing_grid_screenshot_2026-03-19";
const RUNPOD_SCREENSHOT_CAPTURED_AT = Date.parse("2026-03-19T00:00:00.000Z");

type SeedRow = {
  gpuType: string;
  category: string;
  featured: boolean;
  listPricePerHour: number;
  discountedPricePerHour?: number;
};

const RUNPOD_SCREENSHOT_SEED_ROWS: SeedRow[] = [
  { gpuType: "RTX 5090", category: "Featured GPUs", featured: true, listPricePerHour: 0.89, discountedPricePerHour: 0.76 },
  { gpuType: "A40", category: "Featured GPUs", featured: true, listPricePerHour: 0.4, discountedPricePerHour: 0.2 },
  { gpuType: "H200 SXM", category: "Featured GPUs", featured: true, listPricePerHour: 3.59, discountedPricePerHour: 3.05 },
  { gpuType: "B200", category: "Featured GPUs", featured: true, listPricePerHour: 4.99, discountedPricePerHour: 4.24 },
  { gpuType: "RTX 2000 Ada", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.24, discountedPricePerHour: 0.18 },
  { gpuType: "RTX 4000 Ada", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.26 },
  { gpuType: "RTX 4090", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.59, discountedPricePerHour: 0.5 },
  { gpuType: "L4", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.39, discountedPricePerHour: 0.32 },
  { gpuType: "RTX PRO 4500", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.54, discountedPricePerHour: 0.46 },
  { gpuType: "L40", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.99 },
  { gpuType: "L40S", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.86, discountedPricePerHour: 0.71 },
  { gpuType: "RTX 6000 Ada", category: "NVIDIA latest generation", featured: false, listPricePerHour: 0.77, discountedPricePerHour: 0.63 },
  { gpuType: "H100 SXM", category: "NVIDIA latest generation", featured: false, listPricePerHour: 2.69 },
  { gpuType: "H100 PCIe", category: "NVIDIA latest generation", featured: false, listPricePerHour: 2.39 },
  { gpuType: "H100 NVL", category: "NVIDIA latest generation", featured: false, listPricePerHour: 3.07, discountedPricePerHour: 2.61 },
  { gpuType: "RTX PRO 6000", category: "NVIDIA latest generation", featured: false, listPricePerHour: 1.69, discountedPricePerHour: 1.44 },
  { gpuType: "RTX PRO 6000 WK", category: "NVIDIA latest generation", featured: false, listPricePerHour: 1.89, discountedPricePerHour: 1.61 },
  { gpuType: "NVIDIA H200 NVL", category: "NVIDIA latest generation", featured: false, listPricePerHour: 3.39 },
  { gpuType: "RTX A4000", category: "NVIDIA previous generation", featured: false, listPricePerHour: 0.25 },
  { gpuType: "RTX A4500", category: "NVIDIA previous generation", featured: false, listPricePerHour: 0.25, discountedPricePerHour: 0.19 },
  { gpuType: "RTX 3090", category: "NVIDIA previous generation", featured: false, listPricePerHour: 0.46 },
  { gpuType: "RTX A5000", category: "NVIDIA previous generation", featured: false, listPricePerHour: 0.27, discountedPricePerHour: 0.2 },
  { gpuType: "RTX A6000", category: "NVIDIA previous generation", featured: false, listPricePerHour: 0.49, discountedPricePerHour: 0.4 },
  { gpuType: "A100 PCIe", category: "NVIDIA previous generation", featured: false, listPricePerHour: 1.39, discountedPricePerHour: 1.14 },
  { gpuType: "A100 SXM", category: "NVIDIA previous generation", featured: false, listPricePerHour: 1.49, discountedPricePerHour: 1.22 },
  { gpuType: "MI300X", category: "AMD", featured: false, listPricePerHour: 1.99, discountedPricePerHour: 1.51 },
];

const gpuPricingSnapshotRowValidator = v.object({
  provider: v.string(),
  gpu_type: v.string(),
  display_name: v.string(),
  category: v.string(),
  featured: v.boolean(),
  currency: v.string(),
  list_price_per_hour: v.number(),
  discounted_price_per_hour: v.union(v.number(), v.null()),
  source: v.string(),
  source_captured_at: v.number(),
  synced_at: v.number(),
});

function normalizeGpuTypeKey(value: string) {
  return value.trim().toLowerCase();
}

function compareSeedRows(a: SeedRow, b: SeedRow) {
  if (a.category !== b.category) {
    return a.category.localeCompare(b.category);
  }
  return a.gpuType.localeCompare(b.gpuType);
}

async function upsertRunpodScreenshotSeedRows(ctx: MutationCtx) {
  const syncedAt = Date.now();
  const rows = [...RUNPOD_SCREENSHOT_SEED_ROWS].sort(compareSeedRows);

  for (const row of rows) {
    const gpuTypeKey = normalizeGpuTypeKey(row.gpuType);
    const existing = await ctx.db
      .query("gpuPricingSnapshots")
      .withIndex("by_provider_and_gpu_type_key", (q) =>
        q.eq("provider", RUNPOD_PROVIDER).eq("gpuTypeKey", gpuTypeKey),
      )
      .first();

    const payload = {
      provider: RUNPOD_PROVIDER,
      gpuType: row.gpuType,
      gpuTypeKey,
      displayName: row.gpuType,
      category: row.category,
      featured: row.featured,
      currency: "USD",
      listPricePerHour: row.listPricePerHour,
      discountedPricePerHour: row.discountedPricePerHour,
      source: RUNPOD_SCREENSHOT_SOURCE,
      sourceCapturedAt: RUNPOD_SCREENSHOT_CAPTURED_AT,
      syncedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      continue;
    }

    await ctx.db.insert("gpuPricingSnapshots", payload);
  }

  return {
    provider: RUNPOD_PROVIDER,
    source: RUNPOD_SCREENSHOT_SOURCE,
    upserted: rows.length,
  };
}

export const listSnapshots = query({
  args: {
    provider: v.optional(v.string()),
  },
  returns: v.array(gpuPricingSnapshotRowValidator),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const provider = args.provider?.trim() || RUNPOD_PROVIDER;
    const rows = await ctx.db
      .query("gpuPricingSnapshots")
      .withIndex("by_provider", (q) => q.eq("provider", provider))
      .collect();

    rows.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.gpuType.localeCompare(b.gpuType);
    });

    return rows.map((row) => ({
      provider: row.provider,
      gpu_type: row.gpuType,
      display_name: row.displayName,
      category: row.category,
      featured: row.featured,
      currency: row.currency,
      list_price_per_hour: row.listPricePerHour,
      discounted_price_per_hour:
        typeof row.discountedPricePerHour === "number" ? row.discountedPricePerHour : null,
      source: row.source,
      source_captured_at: row.sourceCapturedAt,
      synced_at: row.syncedAt,
    }));
  },
});

export const seedRunpodScreenshotPricing = mutation({
  args: {},
  returns: v.object({
    provider: v.string(),
    source: v.string(),
    upserted: v.number(),
  }),
  handler: async (ctx) => {
    await requireUser(ctx);
    return upsertRunpodScreenshotSeedRows(ctx);
  },
});

export const internalSeedRunpodScreenshotPricing = internalMutation({
  args: {},
  returns: v.object({
    provider: v.string(),
    source: v.string(),
    upserted: v.number(),
  }),
  handler: async (ctx) => upsertRunpodScreenshotSeedRows(ctx),
});
