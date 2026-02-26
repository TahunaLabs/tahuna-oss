import { Workpool } from "@convex-dev/workpool";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const provisionPool = new Workpool(components.workpool, {
  maxParallelism: 3,
  retryActionsByDefault: true,
});

function toRunResponse(row: any) {
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

export const list = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return {
      runs: rows.sort((a, b) => b.createdAt - a.createdAt).map(toRunResponse),
    };
  },
});

export const get = query({
  args: { userId: v.id("users"), runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row || row.userId !== args.userId) {
      throw new Error("run not found");
    }
    return toRunResponse(row);
  },
});

export const getLogs = query({
  args: { userId: v.id("users"), runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row || row.userId !== args.userId) {
      throw new Error("run not found");
    }
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
    userId: v.id("users"),
    environmentId: v.id("environments"),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const env = await ctx.db.get(args.environmentId);
    if (!env || env.userId !== args.userId) {
      throw new Error("environment not found");
    }

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
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("runEvents", {
      runId,
      status: "queued",
      message: "run queued for execution",
      createdAt: now,
      metadata: {
        gpu_type: args.gpu_type || env.gpuType,
        gpu_count: args.gpu_count || env.gpuCount,
        volume_gb: args.volume_gb || env.volumeGb,
      },
    });

    await provisionPool.enqueueAction(ctx, internal.runs.provisionRun, { runId });
    const row = await ctx.db.get(runId);
    return toRunResponse(row);
  },
});

export const remove = mutation({
  args: { userId: v.id("users"), runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row || row.userId !== args.userId) {
      throw new Error("run not found");
    }

    if (ACTIVE_STATUSES.has(row.status)) {
      await ctx.db.patch(args.runId, {
        status: "cancelling",
        cancellationRequested: true,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("runEvents", {
        runId: args.runId,
        status: "cancelling",
        message: "cancellation requested",
        createdAt: Date.now(),
      });
      return { cancel_requested: true, run_id: String(args.runId) };
    }

    await ctx.db.delete(args.runId);
    return { deleted: true, run_id: String(args.runId) };
  },
});

export const provisionRun = internalAction({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    // Step 1: move to provisioning/running quickly inside action.
    await ctx.runMutation(internal.runs.markRunning, { runId: args.runId });

    // Step 2: long waits must not stay in one action; schedule completion as a separate step.
    await ctx.scheduler.runAfter(30_000, internal.runs.completeRun, { runId: args.runId });
  },
});

export const markRunning = internalMutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      if (row?.cancellationRequested) {
        await ctx.db.patch(args.runId, { status: "cancelled", updatedAt: Date.now() });
      }
      return;
    }

    await ctx.db.patch(args.runId, {
      status: "running",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: "running",
      message: "pod running",
      createdAt: Date.now(),
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
      updatedAt: Date.now(),
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: terminal,
      message: terminal === "completed" ? "run completed" : "run cancelled",
      createdAt: Date.now(),
    });
  },
});
