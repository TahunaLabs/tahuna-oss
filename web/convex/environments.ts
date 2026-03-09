import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { images } from "@convex/catalog";

const environmentResponseValidator = v.object({
  environment_id: v.string(),
  name: v.string(),
  artifacts: v.string(),
  gpu_type: v.string(),
  gpu_count: v.number(),
  volume_gb: v.number(),
  framework: v.string(),
  version: v.string(),
});

const listEnvironmentsResponseValidator = v.object({
  environments: v.array(environmentResponseValidator),
});
const commitSyncPointersResponseValidator = v.object({
  ok: v.boolean(),
  environment_id: v.string(),
  code_manifest_hash: v.optional(v.string()),
  data_manifest_hash: v.optional(v.string()),
});

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
    throw new ConvexError("invalid environment payload");
  }

  const versions = images[args.framework];
  if (!versions) {
    throw new ConvexError(`unsupported framework: ${args.framework}`);
  }
  if (!versions[args.version]) {
    throw new ConvexError(`unsupported version for framework ${args.framework}: ${args.version}`);
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
  const row = await ctx.db.get("environments", environmentId);
  if (!row || row.userId !== userId) {
    throw new ConvexError("environment not found");
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

  await ctx.db.patch("environments", envId, {
    artifacts: environmentPath(args.userId, String(envId)),
  });

  const env = await ctx.db.get("environments", envId);
  if (!env) {
    throw new ConvexError("failed to create environment");
  }

  return toEnvironmentResponse(env);
}

async function removeEnvironmentForUserId(ctx: MutationCtx, userId: string, environmentId: Id<"environments">) {
  await getOwnedEnvironment(ctx, userId, environmentId);

  const existingRun = await ctx.db
    .query("runs")
    .withIndex("by_user_and_environment", (q) => q.eq("userId", userId).eq("environmentId", environmentId))
    .first();

  if (existingRun) {
    throw new ConvexError("environment still has runs; delete them first");
  }

  await ctx.db.delete("environments", environmentId);
  return { deleted: true, environment_id: String(environmentId) };
}

// ---------- public (auth via ctx.auth) ----------

export const list = query({
  args: {},
  returns: listEnvironmentsResponseValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listByUserId(ctx, String(user._id));
  },
});

export const get = query({
  args: { environmentId: v.id("environments") },
  returns: environmentResponseValidator,
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
  returns: environmentResponseValidator,
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
  returns: v.object({ deleted: v.boolean(), environment_id: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return removeEnvironmentForUserId(ctx, String(user._id), args.environmentId);
  },
});

// ---------- internal (for CLI proxy routes that pass userId explicitly) ----------

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listEnvironmentsResponseValidator,
  handler: async (ctx, args) => {
    return listByUserId(ctx, args.userId);
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), environmentId: v.id("environments") },
  returns: environmentResponseValidator,
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
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    return createEnvironmentForUserId(ctx, args);
  },
});

export const internalRemove = internalMutation({
  args: { userId: v.string(), environmentId: v.id("environments") },
  returns: v.object({ deleted: v.boolean(), environment_id: v.string() }),
  handler: async (ctx, args) => {
    return removeEnvironmentForUserId(ctx, args.userId, args.environmentId);
  },
});

export const internalCommitSyncPointers = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    code_manifest_hash: v.optional(v.string()),
    data_manifest_hash: v.optional(v.string()),
  },
  returns: commitSyncPointersResponseValidator,
  handler: async (ctx, args) => {
    const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
    const patch: {
      latestSyncAt: number;
      latestCodeManifestHash?: string;
      latestDataManifestHash?: string;
    } = { latestSyncAt: Date.now() };

    if (args.code_manifest_hash) {
      patch.latestCodeManifestHash = args.code_manifest_hash;
    }
    if (args.data_manifest_hash) {
      patch.latestDataManifestHash = args.data_manifest_hash;
    }

    await ctx.db.patch("environments", args.environmentId, patch);

    return {
      ok: true,
      environment_id: String(args.environmentId),
      code_manifest_hash: args.code_manifest_hash ?? env.latestCodeManifestHash,
      data_manifest_hash: args.data_manifest_hash ?? env.latestDataManifestHash,
    };
  },
});
