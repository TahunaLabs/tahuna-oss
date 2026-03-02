import { v } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { images } from "@convex/catalog";

function environmentPath(userId: string, environmentId: string) {
  return `${userId}/environment/${environmentId}`;
}

function validateEnvironmentPayload(args: {
  gpu_count: number;
  volume_gb: number;
  framework: string;
  version: string;
}) {
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
}

function toEnvironmentResponse(row: Doc<"environments">) {
  return {
    environment_id: String(row._id),
    name: row.name,
    artifacts: environmentPath(row.userId, String(row._id)),
    gpu_type: row.gpuType,
    gpu_count: row.gpuCount,
    volume_gb: row.volumeGb,
    framework: row.framework,
    version: row.version,
  };
}

async function listByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("environments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return {
    environments: rows.sort((a, b) => b._creationTime - a._creationTime).map(toEnvironmentResponse),
  };
}

async function getOwnedEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
) {
  const row = await ctx.db.get(environmentId);
  if (!row || row.userId !== userId) {
    throw new Error("environment not found");
  }
  return row;
}

async function createEnvironmentForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    name: string;
    gpu_type: string;
    gpu_count: number;
    volume_gb: number;
    framework: string;
    version: string;
  },
) {
  validateEnvironmentPayload(args);

  const envId = await ctx.db.insert("environments", {
    userId: args.userId,
    name: args.name,
    artifacts: "",
    gpuType: args.gpu_type,
    gpuCount: args.gpu_count,
    volumeGb: args.volume_gb,
    framework: args.framework,
    version: args.version,
  });

  await ctx.db.patch(envId, {
    artifacts: environmentPath(args.userId, String(envId)),
  });

  const env = await ctx.db.get(envId);
  if (!env) {
    throw new Error("failed to create environment");
  }

  return toEnvironmentResponse(env);
}

async function removeEnvironmentForUserId(ctx: MutationCtx, userId: string, environmentId: Id<"environments">) {
  await getOwnedEnvironment(ctx, userId, environmentId);

  const runs = await ctx.db
    .query("runs")
    .withIndex("by_environment", (q) => q.eq("environmentId", environmentId))
    .collect();

  if (runs.some((r) => r.userId === userId)) {
    throw new Error("environment still has runs; delete them first");
  }

  await ctx.db.delete(environmentId);
  return { deleted: true, environment_id: String(environmentId) };
}

// ---------- public (auth via ctx.auth) ----------

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listByUserId(ctx, String(user._id));
  },
});

export const get = query({
  args: { environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedEnvironment(ctx, String(user._id), args.environmentId);
    return toEnvironmentResponse(row);
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
    return createEnvironmentForUserId(ctx, {
      userId: String(user._id),
      name: args.name,
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
      framework: args.framework,
      version: args.version,
    });
  },
});

export const remove = mutation({
  args: { environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return removeEnvironmentForUserId(ctx, String(user._id), args.environmentId);
  },
});

// ---------- internal (for CLI proxy routes that pass userId explicitly) ----------

export const internalList = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return listByUserId(ctx, args.userId);
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    const row = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
    return toEnvironmentResponse(row);
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
    return createEnvironmentForUserId(ctx, args);
  },
});

export const internalRemove = internalMutation({
  args: { userId: v.string(), environmentId: v.id("environments") },
  handler: async (ctx, args) => {
    return removeEnvironmentForUserId(ctx, args.userId, args.environmentId);
  },
});
