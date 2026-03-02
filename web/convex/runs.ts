import { Workpool } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireUser } from "./auth";

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const provisionPool = new Workpool(components.workpool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
});

function toRunResponse(row: Doc<"runs">) {
  return {
    run_id: String(row._id),
    env_id: String(row.environmentId),
    input: row.input,
    output: row.output,
    logs: row.logs,
    status: row.status,
    error: row.error || "",
    pod_id: row.podId || "",
    effective_gpu_type: row.effectiveGpuType || "",
    effective_gpu_count: row.effectiveGpuCount || 0,
    effective_volume_gb: row.effectiveVolumeGb || 0,
    cancellation_requested: row.cancellationRequested,
  };
}

async function listByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return {
    runs: rows.sort((a, b) => b._creationTime - a._creationTime).map(toRunResponse),
  };
}

async function getOwnedRun(ctx: QueryCtx | MutationCtx, userId: string, runId: Id<"runs">) {
  const row = await ctx.db.get(runId);
  if (!row || row.userId !== userId) {
    throw new Error("run not found");
  }
  return row;
}

async function getOwnedEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
) {
  const env = await ctx.db.get(environmentId);
  if (!env || env.userId !== userId) {
    throw new Error("environment not found");
  }
  return env;
}

async function createRunForUserId(
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

  const now = Date.now();
  const runId = await ctx.db.insert("runs", {
    userId: args.userId,
    environmentId: args.environmentId,
    input: `runs/${args.environmentId}/${now}/input`,
    output: `runs/${args.environmentId}/${now}/output`,
    logs: `runs/${args.environmentId}/${now}/logs`,
    status: "queued",
    cancellationRequested: false,
    effectiveGpuType: args.gpu_type || env.gpuType,
    effectiveGpuCount: args.gpu_count || env.gpuCount,
    effectiveVolumeGb: args.volume_gb || env.volumeGb,
  });

  await ctx.db.insert("runEvents", {
    runId,
    status: "queued",
    message: "run queued for execution",
    metadata: {
      gpu_type: args.gpu_type || env.gpuType,
      gpu_count: args.gpu_count || env.gpuCount,
      volume_gb: args.volume_gb || env.volumeGb,
    },
  });

  await provisionPool.enqueueAction(ctx, internal.runs.provisionRun, { runId });
  const row = await ctx.db.get(runId);
  if (!row) {
    throw new Error("failed to create run");
  }
  return toRunResponse(row);
}

async function removeRunForUserId(ctx: MutationCtx, userId: string, runId: Id<"runs">) {
  const row = await getOwnedRun(ctx, userId, runId);

  if (ACTIVE_STATUSES.has(row.status)) {
    await ctx.db.patch(runId, {
      status: "cancelling",
      cancellationRequested: true,
    });
    await ctx.db.insert("runEvents", {
      runId,
      status: "cancelling",
      message: "cancellation requested",
    });
    return { cancel_requested: true, run_id: String(runId) };
  }

  await ctx.db.delete(runId);
  return { deleted: true, run_id: String(runId) };
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
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedRun(ctx, String(user._id), args.runId);
    return toRunResponse(row);
  },
});

export const getLogs = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedRun(ctx, String(user._id), args.runId);
    return {
      run_id: String(row._id),
      logs_path: row.logs,
      log_file: `${row.logs}/run.log`,
      note: "Logs are uploaded by the training pod into object storage.",
    };
  },
});

export const internalGetLogs = internalQuery({
  args: { userId: v.string(), runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await getOwnedRun(ctx, args.userId, args.runId);
    return {
      run_id: String(row._id),
      logs_path: row.logs,
      log_file: `${row.logs}/run.log`,
      note: "Logs are uploaded by the training pod into object storage.",
    };
  },
});

export const create = mutation({
  args: {
    environmentId: v.id("environments"),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createRunForUserId(ctx, {
      userId: String(user._id),
      environmentId: args.environmentId,
      gpu_type: args.gpu_type,
      gpu_count: args.gpu_count,
      volume_gb: args.volume_gb,
    });
  },
});

export const remove = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return removeRunForUserId(ctx, String(user._id), args.runId);
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
  args: { userId: v.string(), runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await getOwnedRun(ctx, args.userId, args.runId);
    return toRunResponse(row);
  },
});

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return createRunForUserId(ctx, args);
  },
});

export const internalRemove = internalMutation({
  args: { userId: v.string(), runId: v.id("runs") },
  handler: async (ctx, args) => {
    return removeRunForUserId(ctx, args.userId, args.runId);
  },
});

// ---------- internal lifecycle ----------

export const provisionRun = internalAction({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.runs.markRunning, { runId: args.runId });
    await ctx.scheduler.runAfter(30_000, internal.runs.completeRun, { runId: args.runId });
  },
});

export const markRunning = internalMutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      if (row?.cancellationRequested) {
        await ctx.db.patch(args.runId, { status: "cancelled" });
      }
      return;
    }

    await ctx.db.patch(args.runId, {
      status: "running",
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: "running",
      message: "pod running",
    });
  },
});

export const completeRun = internalMutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row || TERMINAL_STATUSES.has(row.status)) {
      return;
    }

    const terminal = row.cancellationRequested ? "cancelled" : "completed";
    await ctx.db.patch(args.runId, {
      status: terminal,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: terminal,
      message: terminal === "completed" ? "run completed" : "run cancelled",
    });
  },
});
