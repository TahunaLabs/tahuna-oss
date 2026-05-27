import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { RUN_CONFIG, PYTHON_CONFIG } from "@convex/appConfig";
import { assignQueuedRunToComputeSession } from "@convex/computeSessionAssignment";
import { getAccessibleEnvironment } from "@convex/runsAccess";
import { resolveImageName } from "@convex/runtimeProvisioning";
import {
  planComputeSessionCreation,
  planComputeSessionFailure,
  planComputeSessionHeartbeat,
  planComputeSessionIdle,
  planComputeSessionMachineProvisioned,
  planComputeSessionStop,
  planComputeSessionTerminated,
  type ComputeSessionEvent,
  type ComputeSessionPatch,
} from "@convex/core/computeSessionLifecyclePlan";
import {
  listComputeSessionEvents,
  listComputeSessionsByUserId,
  toComputeSessionResponse,
} from "@convex/computeSessionsRead";

const computeSessionResponseValidator = v.object({
  compute_session_id: v.string(),
  created_at: v.number(),
  environment_id: v.string(),
  status: v.string(),
  error: v.string(),
  provider_machine_id: v.string(),
  active_run_id: v.string(),
  effective_gpu_type: v.string(),
  effective_gpu_count: v.number(),
  effective_volume_gb: v.number(),
  framework: v.string(),
  framework_version: v.string(),
  python_version: v.string(),
  image_name: v.string(),
  idle_timeout_seconds: v.number(),
  last_heartbeat_at: v.union(v.number(), v.null()),
  last_idle_at: v.union(v.number(), v.null()),
  terminated_at: v.union(v.number(), v.null()),
});

const listComputeSessionsResponseValidator = v.object({
  compute_sessions: v.array(computeSessionResponseValidator),
});

const computeSessionEventResponseValidator = v.object({
  status: v.string(),
  message: v.string(),
  metadata: v.union(v.any(), v.null()),
  created_at: v.number(),
});

const listComputeSessionEventsResponseValidator = v.object({
  events: v.array(computeSessionEventResponseValidator),
});

function normalizeIdleTimeoutSeconds(value: number | undefined) {
  const resolved = value ?? RUN_CONFIG.computeSessionDefaultIdleTimeoutSeconds;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new ConvexError("idle_timeout_seconds must be a positive integer");
  }
  if (resolved > RUN_CONFIG.computeSessionMaxIdleTimeoutSeconds) {
    throw new ConvexError(
      `idle_timeout_seconds must be <= ${RUN_CONFIG.computeSessionMaxIdleTimeoutSeconds}`,
    );
  }
  return resolved;
}

function toComputeSessionState(row: Doc<"computeSessions">) {
  return {
    computeSessionId: String(row._id),
    status: row.status,
    providerMachineId: row.providerMachineId,
    runtimeTokenHash: row.runtimeTokenHash,
    activeRunId: row.activeRunId ? String(row.activeRunId) : undefined,
  };
}

async function insertComputeSessionEvents(
  ctx: MutationCtx,
  computeSessionId: Id<"computeSessions">,
  events: ComputeSessionEvent[] | undefined,
) {
  for (const event of events ?? []) {
    await ctx.db.insert("computeSessionEvents", {
      computeSessionId,
      status: event.status,
      message: event.message,
      ...(event.metadata ? { metadata: event.metadata } : {}),
    });
  }
}

async function applyComputeSessionPlan(
  ctx: MutationCtx,
  computeSessionId: Id<"computeSessions">,
  plan: { patch?: ComputeSessionPatch; events?: ComputeSessionEvent[] },
) {
  if (plan.patch) {
    const { activeRunId, ...patch } = plan.patch;
    const nextPatch: Partial<Doc<"computeSessions">> = { ...patch };
    if ("activeRunId" in plan.patch) {
      nextPatch.activeRunId = activeRunId ? (activeRunId as Id<"runs">) : undefined;
    }
    await ctx.db.patch("computeSessions", computeSessionId, nextPatch);
  }
  await insertComputeSessionEvents(ctx, computeSessionId, plan.events);
}

async function getAccessibleComputeSession(
  ctx: MutationCtx,
  userId: string,
  computeSessionId: Id<"computeSessions">,
) {
  const row = await ctx.db.get("computeSessions", computeSessionId);
  if (!row || row.userId !== userId) {
    throw new ConvexError("compute session not found");
  }
  return row;
}

async function createComputeSessionForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    idleTimeoutSeconds?: number;
  },
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const pythonVersion = env.pythonVersion || PYTHON_CONFIG.defaultVersion;
  const idleTimeoutSeconds = normalizeIdleTimeoutSeconds(args.idleTimeoutSeconds);
  const imageName = resolveImageName(env.framework, env.version, pythonVersion);
  const now = Date.now();
  const plan = planComputeSessionCreation({
    nowMs: now,
    userId: args.userId,
    environmentId: String(args.environmentId),
    effectiveGpuType: env.gpuType,
    effectiveGpuCount: env.gpuCount,
    effectiveVolumeGb: env.volumeGb,
    framework: env.framework,
    frameworkVersion: env.version,
    pythonVersion,
    imageName,
    idleTimeoutSeconds,
  });
  const computeSessionId = await ctx.db.insert("computeSessions", {
    ...plan.session,
    environmentId: args.environmentId,
  });
  await insertComputeSessionEvents(ctx, computeSessionId, [plan.event]);
  const row = await ctx.db.get("computeSessions", computeSessionId);
  if (!row) {
    throw new ConvexError("failed to create compute session");
  }
  return toComputeSessionResponse(row);
}

export const list = query({
  args: {},
  returns: listComputeSessionsResponseValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listComputeSessionsByUserId(ctx, String(user._id));
  },
});

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listComputeSessionsResponseValidator,
  handler: async (ctx, args) => {
    return listComputeSessionsByUserId(ctx, args.userId);
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), computeSessionId: v.id("computeSessions") },
  returns: computeSessionResponseValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row || row.userId !== args.userId) {
      throw new ConvexError("compute session not found");
    }
    return toComputeSessionResponse(row);
  },
});

export const internalGetEvents = internalQuery({
  args: { computeSessionId: v.id("computeSessions") },
  returns: listComputeSessionEventsResponseValidator,
  handler: async (ctx, args) => {
    return listComputeSessionEvents(ctx, args.computeSessionId);
  },
});

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    idleTimeoutSeconds: v.optional(v.number()),
  },
  returns: computeSessionResponseValidator,
  handler: async (ctx, args) => {
    return createComputeSessionForUserId(ctx, args);
  },
});

export const internalMarkMachineProvisioned = internalMutation({
  args: {
    computeSessionId: v.id("computeSessions"),
    providerMachineId: v.string(),
    providerCreationTime: v.optional(v.number()),
    runtimeTokenHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionMachineProvisioned({
        session: toComputeSessionState(row),
        providerMachineId: args.providerMachineId,
        providerCreationTime: args.providerCreationTime,
        runtimeTokenHash: args.runtimeTokenHash,
        nowMs: Date.now(),
      }),
    );
    return null;
  },
});

export const internalHeartbeat = internalMutation({
  args: { computeSessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionHeartbeat({ session: toComputeSessionState(row), nowMs: Date.now() }),
    );
    return null;
  },
});

export const internalMarkIdle = internalMutation({
  args: { computeSessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionIdle({ session: toComputeSessionState(row), nowMs: Date.now() }),
    );
    return null;
  },
});

export const internalAssignRun = internalMutation({
  args: { computeSessionId: v.id("computeSessions"), runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assignQueuedRunToComputeSession(ctx, args);
    return null;
  },
});

export const internalStop = internalMutation({
  args: { userId: v.string(), computeSessionId: v.id("computeSessions"), force: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await getAccessibleComputeSession(ctx, args.userId, args.computeSessionId);
    const plan = planComputeSessionStop({
      session: toComputeSessionState(row),
      force: args.force === true,
      nowMs: Date.now(),
    });
    if (plan.error) {
      throw new ConvexError(plan.error);
    }
    await applyComputeSessionPlan(ctx, args.computeSessionId, plan);
    return null;
  },
});

export const internalMarkTerminated = internalMutation({
  args: { computeSessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionTerminated({ session: toComputeSessionState(row), nowMs: Date.now() }),
    );
    return null;
  },
});

export const internalMarkFailed = internalMutation({
  args: { computeSessionId: v.id("computeSessions"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionFailure({
        session: toComputeSessionState(row),
        error: args.error,
        nowMs: Date.now(),
      }),
    );
    return null;
  },
});
