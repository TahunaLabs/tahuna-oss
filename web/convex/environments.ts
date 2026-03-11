import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { internal } from "@convex/_generated/api";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { images } from "@convex/catalog";
import { shortId } from "@convex/ids";

const environmentResponseValidator = v.object({
  environment_id: v.string(),
  data_id: v.string(),
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
  const dataId = row.dataId || String(row._id);
  return {
    environment_id: String(row._id),
    data_id: dataId,
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
    dataId: shortId("data"),
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

async function updateEnvironmentSpecsForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
  },
) {
  const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
  const nextGpuType = typeof args.gpu_type === "string" && args.gpu_type.trim() !== "" ? args.gpu_type.trim() : env.gpuType;
  const nextGpuCount = typeof args.gpu_count === "number" ? args.gpu_count : env.gpuCount;
  const nextVolumeGb = typeof args.volume_gb === "number" ? args.volume_gb : env.volumeGb;

  if (nextGpuCount < 1 || nextVolumeGb < 1) {
    throw new ConvexError("invalid environment payload");
  }

  await ctx.db.patch("environments", args.environmentId, {
    gpuType: nextGpuType,
    gpuCount: nextGpuCount,
    volumeGb: nextVolumeGb,
  });

  const updated = await ctx.db.get("environments", args.environmentId);
  if (!updated) {
    throw new ConvexError("failed to update environment");
  }
  return toEnvironmentResponse(updated);
}

async function removeEnvironmentForUserId(ctx: MutationCtx, userId: string, environmentId: Id<"environments">) {
  await getOwnedEnvironment(ctx, userId, environmentId);

  // Cascade: delete all runs belonging to this environment
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_user_and_environment", (q) => q.eq("userId", userId).eq("environmentId", environmentId))
    .collect();

  for (const run of runs) {
    // Terminate Runpod pod if active
    if (run.podId) {
      await ctx.scheduler.runAfter(0, internal.runs.internalTerminatePod, {
        podId: run.podId,
      });
    }

    // Delete run events, logs, and metrics
    const [events, runtimeLogs, runtimeMetrics] = await Promise.all([
      ctx.db
        .query("runEvents")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect(),
      ctx.db
        .query("runRuntimeLogs")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect(),
      ctx.db
        .query("runRuntimeMetrics")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect(),
    ]);
    await Promise.all([
      ...events.map((event) => ctx.db.delete(event._id)),
      ...runtimeLogs.map((entry) => ctx.db.delete(entry._id)),
      ...runtimeMetrics.map((entry) => ctx.db.delete(entry._id)),
    ]);
    await ctx.db.delete("runs", run._id);
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

export const internalUpdateSpecs = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    if (typeof args.gpu_type === "undefined" && typeof args.gpu_count === "undefined" && typeof args.volume_gb === "undefined") {
      throw new ConvexError("at least one of gpu_type, gpu_count, or volume_gb is required");
    }
    return updateEnvironmentSpecsForUserId(ctx, args);
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
