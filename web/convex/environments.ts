import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { images } from "./catalog";
import { shortId } from "./ids";

// ---------- helpers ----------

import { authComponent } from "./auth";

async function requireUser(ctx: any) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

// ---------- public (auth via ctx.auth) ----------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("environments")
      .withIndex("by_user", (q) => q.eq("userId", String(user._id)))
      .collect();

    return {
      environments: rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((row) => ({
          environment_id: String(row._id),
          name: row.name,
          artifacts: row.artifacts,
          gpu_type: row.gpuType,
          gpu_count: row.gpuCount,
          volume_gb: row.volumeGb,
          framework: row.framework,
          version: row.version,
        })),
    };
  },
});

export const get = query({
  args: { environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.environmentId);
    if (!row || row.userId !== String(user._id)) {
      throw new Error("environment not found");
    }
    return {
      environment_id: String(row._id),
      name: row.name,
      artifacts: row.artifacts,
      gpu_type: row.gpuType,
      gpu_count: row.gpuCount,
      volume_gb: row.volumeGb,
      framework: row.framework,
      version: row.version,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    gpu_type: v.string(),
    gpu_count: v.number(),
    volume_gb: v.number(),
    framework: v.string(),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    if (args.gpu_count < 1 || args.volume_gb < 1) {
      throw new Error("invalid environment payload");
    }

    const versions = images[args.framework];
    if (!versions) {
      throw new Error(`unsupported framework: ${args.framework}`);
    }
    if (!versions[args.version]) {
      throw new Error(`unsupported version for framework ${args.framework}: ${args.version}`);
    }

    const envId = await ctx.db.insert("environments", {
      userId: String(user._id),
      name: args.name,
      artifacts: `environments/${shortId()}/artifacts`,
      gpuType: args.gpu_type,
      gpuCount: args.gpu_count,
      volumeGb: args.volume_gb,
      framework: args.framework,
      version: args.version,
    });

    const env = await ctx.db.get(envId);
    if (!env) {
      throw new Error("failed to create environment");
    }

    return {
      environment_id: String(env._id),
      name: env.name,
      artifacts: env.artifacts,
      gpu_type: env.gpuType,
      gpu_count: env.gpuCount,
      volume_gb: env.volumeGb,
      framework: env.framework,
      version: env.version,
    };
  },
});

export const remove = mutation({
  args: { environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const env = await ctx.db.get(args.environmentId);
    if (!env || env.userId !== String(user._id)) {
      throw new Error("environment not found");
    }

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .collect();

    if (runs.some((r) => r.userId === String(user._id))) {
      throw new Error("environment still has runs; delete them first");
    }

    await ctx.db.delete(args.environmentId);
    return { deleted: true, environment_id: String(args.environmentId) };
  },
});

// ---------- internal (for CLI proxy routes that pass userId explicitly) ----------

export const internalList = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("environments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      environments: rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((row) => ({
          environment_id: String(row._id),
          name: row.name,
          artifacts: row.artifacts,
          gpu_type: row.gpuType,
          gpu_count: row.gpuCount,
          volume_gb: row.volumeGb,
          framework: row.framework,
          version: row.version,
        })),
    };
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.environmentId);
    if (!row || row.userId !== args.userId) {
      throw new Error("environment not found");
    }
    return {
      environment_id: String(row._id),
      name: row.name,
      artifacts: row.artifacts,
      gpu_type: row.gpuType,
      gpu_count: row.gpuCount,
      volume_gb: row.volumeGb,
      framework: row.framework,
      version: row.version,
    };
  },
});

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    gpu_type: v.string(),
    gpu_count: v.number(),
    volume_gb: v.number(),
    framework: v.string(),
    version: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.gpu_count < 1 || args.volume_gb < 1) {
      throw new Error("invalid environment payload");
    }

    const versions = images[args.framework];
    if (!versions) {
      throw new Error(`unsupported framework: ${args.framework}`);
    }
    if (!versions[args.version]) {
      throw new Error(`unsupported version for framework ${args.framework}: ${args.version}`);
    }

    const envId = await ctx.db.insert("environments", {
      userId: args.userId,
      name: args.name,
      artifacts: `environments/${shortId()}/artifacts`,
      gpuType: args.gpu_type,
      gpuCount: args.gpu_count,
      volumeGb: args.volume_gb,
      framework: args.framework,
      version: args.version,
    });

    const env = await ctx.db.get(envId);
    if (!env) {
      throw new Error("failed to create environment");
    }

    return {
      environment_id: String(env._id),
      name: env.name,
      artifacts: env.artifacts,
      gpu_type: env.gpuType,
      gpu_count: env.gpuCount,
      volume_gb: env.volumeGb,
      framework: env.framework,
      version: env.version,
    };
  },
});

export const internalRemove = internalMutation({
  args: { userId: v.string(), environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    const env = await ctx.db.get(args.environmentId);
    if (!env || env.userId !== args.userId) {
      throw new Error("environment not found");
    }

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_environment", (q) => q.eq("environmentId", args.environmentId))
      .collect();

    if (runs.some((r) => r.userId === args.userId)) {
      throw new Error("environment still has runs; delete them first");
    }

    await ctx.db.delete(args.environmentId);
    return { deleted: true, environment_id: String(args.environmentId) };
  },
});
