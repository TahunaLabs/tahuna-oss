import { Workpool } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import { components, internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);
const runResponseValidator = v.object({
  run_id: v.string(),
  env_id: v.string(),
  input: v.string(),
  output: v.string(),
  logs: v.string(),
  status: v.string(),
  error: v.string(),
  pod_id: v.string(),
  effective_gpu_type: v.string(),
  effective_gpu_count: v.number(),
  effective_volume_gb: v.number(),
  code_manifest_hash: v.string(),
  data_manifest_hash: v.string(),
  cancellation_requested: v.boolean(),
});
const listRunsResponseValidator = v.object({
  runs: v.array(runResponseValidator),
});
const runLogsResponseValidator = v.object({
  run_id: v.string(),
  logs_path: v.string(),
  log_file: v.string(),
  note: v.string(),
});
const provisioningPayloadValidator = v.object({
  run_id: v.string(),
  environment_id: v.string(),
  user_id: v.string(),
  input_path: v.string(),
  output_path: v.string(),
  logs_path: v.string(),
  code_manifest_hash: v.union(v.string(), v.null()),
  data_manifest_hash: v.union(v.string(), v.null()),
  code_manifest_key: v.union(v.string(), v.null()),
  data_manifest_key: v.union(v.string(), v.null()),
  contract_version: v.string(),
});

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
    code_manifest_hash: row.codeManifestHash || "",
    data_manifest_hash: row.dataManifestHash || "",
    cancellation_requested: row.cancellationRequested,
  };
}

function manifestKey(userId: string, kind: "code" | "data", manifestHash?: string) {
  if (!manifestHash) {
    return null;
  }
  return `${userId}/manifests/${kind}/${manifestHash}.json`;
}

function toProvisioningPayload(row: Doc<"runs">) {
  return {
    run_id: String(row._id),
    environment_id: String(row.environmentId),
    user_id: row.userId,
    input_path: row.input,
    output_path: row.output,
    logs_path: row.logs,
    code_manifest_hash: row.codeManifestHash ?? null,
    data_manifest_hash: row.dataManifestHash ?? null,
    code_manifest_key: manifestKey(row.userId, "code", row.codeManifestHash),
    data_manifest_key: manifestKey(row.userId, "data", row.dataManifestHash),
    contract_version: "sync-incremental-0.1.0",
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
  const row = await ctx.db.get("runs", runId);
  if (!row || row.userId !== userId) {
    throw new ConvexError("run not found");
  }
  return row;
}

async function getOwnedEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
) {
  const env = await ctx.db.get("environments", environmentId);
  if (!env || env.userId !== userId) {
    throw new ConvexError("environment not found");
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
  const codeManifestHash = env.latestCodeManifestHash;
  const dataManifestHash = env.latestDataManifestHash;
  if (!codeManifestHash || !dataManifestHash) {
    throw new ConvexError("environment is not synced; run `tahuna sync` before creating a run");
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
    effectiveGpuType: args.gpu_type ?? env.gpuType,
    effectiveGpuCount: args.gpu_count ?? env.gpuCount,
    effectiveVolumeGb: args.volume_gb ?? env.volumeGb,
    codeManifestHash: codeManifestHash,
    dataManifestHash: dataManifestHash,
  });

  await ctx.db.insert("runEvents", {
    runId,
    status: "queued",
    message: "run queued for execution",
    metadata: {
      gpu_type: args.gpu_type || env.gpuType,
      gpu_count: args.gpu_count ?? env.gpuCount,
      volume_gb: args.volume_gb ?? env.volumeGb,
      code_manifest_hash: codeManifestHash || null,
      data_manifest_hash: dataManifestHash || null,
    },
  });

  await provisionPool.enqueueAction(ctx, internal.runs.provisionRun, { runId });
  const row = await ctx.db.get("runs", runId);
  if (!row) {
    throw new ConvexError("failed to create run");
  }
  return toRunResponse(row);
}

async function removeRunForUserId(ctx: MutationCtx, userId: string, runId: Id<"runs">) {
  const row = await getOwnedRun(ctx, userId, runId);

  if (ACTIVE_STATUSES.has(row.status)) {
    await ctx.db.patch("runs", runId, {
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

  await ctx.db.delete("runs", runId);
  return { deleted: true, run_id: String(runId) };
}

// ---------- public (auth via ctx.auth) ----------

export const list = query({
  args: {},
  returns: listRunsResponseValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listByUserId(ctx, String(user._id));
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedRun(ctx, String(user._id), args.runId);
    return toRunResponse(row);
  },
});

export const getLogs = query({
  args: { runId: v.id("runs") },
  returns: runLogsResponseValidator,
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
  returns: runLogsResponseValidator,
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
  returns: runResponseValidator,
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
  returns: v.union(
    v.object({ cancel_requested: v.boolean(), run_id: v.string() }),
    v.object({ deleted: v.boolean(), run_id: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return removeRunForUserId(ctx, String(user._id), args.runId);
  },
});

// ---------- internal (for CLI proxy routes that pass userId explicitly) ----------

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listRunsResponseValidator,
  handler: async (ctx, args) => {
    return listByUserId(ctx, args.userId);
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: runResponseValidator,
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
  returns: runResponseValidator,
  handler: async (ctx, args) => {
    return createRunForUserId(ctx, args);
  },
});

export const internalRemove = internalMutation({
  args: { userId: v.string(), runId: v.id("runs") },
  returns: v.union(
    v.object({ cancel_requested: v.boolean(), run_id: v.string() }),
    v.object({ deleted: v.boolean(), run_id: v.string() }),
  ),
  handler: async (ctx, args) => {
    return removeRunForUserId(ctx, args.userId, args.runId);
  },
});

// ---------- internal lifecycle ----------

export const internalGetProvisioningPayload = internalQuery({
  args: { runId: v.id("runs") },
  returns: provisioningPayloadValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row) {
      throw new ConvexError("run not found");
    }
    return toProvisioningPayload(row);
  },
});

export const provisionRun = internalAction({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const provisioningPayload = await ctx.runQuery(internal.runs.internalGetProvisioningPayload, {
      runId: args.runId,
    });
    await ctx.runMutation(internal.runs.markRunning, {
      runId: args.runId,
      provisioningPayload,
    });
    await ctx.scheduler.runAfter(30_000, internal.runs.completeRun, { runId: args.runId });
    return null;
  },
});

export const markRunning = internalMutation({
  args: { runId: v.id("runs"), provisioningPayload: v.optional(provisioningPayloadValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || row.cancellationRequested || TERMINAL_STATUSES.has(row.status)) {
      if (row?.cancellationRequested) {
        await ctx.db.patch("runs", args.runId, { status: "cancelled" });
      }
      return null;
    }

    await ctx.db.patch("runs", args.runId, {
      status: "running",
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: "running",
      message: "pod running (simulated)",
      metadata: args.provisioningPayload
        ? {
            provisioning_payload: args.provisioningPayload,
            fetch_strategy: "pod fetches code/data manifests from R2 by pinned manifest hash",
          }
        : undefined,
    });
    return null;
  },
});

export const completeRun = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("runs", args.runId);
    if (!row || TERMINAL_STATUSES.has(row.status)) {
      return null;
    }

    const terminal = row.cancellationRequested ? "cancelled" : "completed";
    await ctx.db.patch("runs", args.runId, {
      status: terminal,
    });
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: terminal,
      message: terminal === "completed" ? "run completed" : "run cancelled",
    });
    return null;
  },
});
