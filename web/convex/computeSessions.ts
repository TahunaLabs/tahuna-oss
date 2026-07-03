import { ConvexError, v } from "convex/values";
import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { normalizeProvisioningError } from "@/lib/runtime-incompatibility";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { RUN_CONFIG } from "@convex/appConfig";
import { assignQueuedRunToComputeSession } from "@convex/computeSessionAssignment";
import {
  clearEnvironmentActiveComputeSession,
  createComputeSessionForUserId,
  insertComputeSessionEvents,
  removeUnprovisionedComputeSessionForUserId,
} from "@convex/computeSessionsLifecycle";
import {
  buildProvisionedRuntimeEnv,
  resolveEnvironmentEnvVarsForEnvironmentId,
} from "@convex/envVars";
import {
  provisionRuntimeMachine,
  resolveWandbBaseURL,
  terminateRuntimeMachine,
  terminateRuntimeMachineWithRetry,
} from "@convex/runtimeProvisioning";
import { fetchSyncManifest } from "@convex/runtimeBootstrap";
import {
  planComputeSessionFailure,
  planComputeSessionHeartbeat,
  planComputeSessionIdle,
  planComputeSessionMachineProvisioned,
  planComputeSessionStop,
  planComputeSessionTerminated,
  isComputeSessionHeartbeatTimedOut,
  isComputeSessionIdleTimedOut,
  TERMINAL_COMPUTE_SESSION_STATUSES,
  type ComputeSessionEvent,
  type ComputeSessionPatch,
} from "@convex/core/computeSessionLifecyclePlan";
import {
  settleHostedComputeSessionUsage,
  type HostedComputeSessionUsageSettlement,
} from "@convex/cloud/billing";
import {
  listComputeSessionEvents,
  listComputeSessionsByUserId,
  toComputeSessionResponse,
} from "@convex/computeSessionsRead";
import { TERMINAL_STATUSES } from "@convex/runsConstants";

const computeSessionResponseValidator = v.object({
  compute_session_id: v.string(),
  created_at: v.number(),
  environment_id: v.string(),
  serve_id: v.string(),
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
const runtimeAssignmentResponseValidator = v.object({
  run_id: v.string(),
});
const timedOutComputeSessionValidator = v.object({
  user_id: v.string(),
  environment_id: v.string(),
  compute_session_id: v.string(),
  active_run_id: v.string(),
  reason: v.union(v.literal("heartbeat"), v.literal("idle")),
});

function toComputeSessionState(row: Doc<"computeSessions">) {
  return {
    computeSessionId: String(row._id),
    status: row.status,
    providerMachineId: row.providerMachineId,
    providerCreationTime: row.providerCreationTime,
    computeStartedAt: row.computeStartedAt,
    computeEndedAt: row.computeEndedAt,
    runtimeTokenHash: row.runtimeTokenHash,
    activeRunId: row.activeRunId ? String(row.activeRunId) : undefined,
  };
}

async function mirrorOneShotSessionBillingToRun(
  ctx: MutationCtx,
  computeSessionId: Id<"computeSessions">,
  session: Doc<"computeSessions">,
  settlement: HostedComputeSessionUsageSettlement | undefined,
) {
  if (!settlement) {
    return;
  }
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_compute_session", (q) => q.eq("computeSessionId", computeSessionId))
    .collect();
  if (runs.length !== 1 || runs[0].executionMode !== "ephemeral") {
    return;
  }
  await ctx.db.patch("runs", runs[0]._id, {
    computeHourlyRateCents: session.computeHourlyRateCents,
    computeChargeCents: settlement.patch.computeChargeCents,
    computeCollectedCents: settlement.patch.computeCollectedCents,
    computeOutstandingCents: settlement.patch.computeOutstandingCents,
    computeChargeStatus: settlement.patch.computeChargeStatus,
    computeChargeError: settlement.patch.computeChargeError,
  });
}

async function applyComputeSessionPlan(
  ctx: MutationCtx,
  computeSessionId: Id<"computeSessions">,
  plan: { patch?: ComputeSessionPatch; events?: ComputeSessionEvent[] },
) {
  let settlement: HostedComputeSessionUsageSettlement | undefined;
  let settlementSession: Doc<"computeSessions"> | undefined;
  if (plan.patch) {
    const { activeRunId, ...patch } = plan.patch;
    const nextPatch: Partial<Doc<"computeSessions">> = { ...patch };
    if ("activeRunId" in plan.patch) {
      nextPatch.activeRunId = activeRunId ? (activeRunId as Id<"runs">) : undefined;
    }
    if (nextPatch.status && TERMINAL_COMPUTE_SESSION_STATUSES.has(nextPatch.status)) {
      const current = await ctx.db.get("computeSessions", computeSessionId);
      if (current) {
        settlementSession = {
          ...current,
          ...nextPatch,
        };
        settlement = await settleHostedComputeSessionUsage(ctx, settlementSession);
        Object.assign(nextPatch, settlement.patch);
      }
    }
    await ctx.db.patch("computeSessions", computeSessionId, nextPatch);
  }
  await insertComputeSessionEvents(ctx, computeSessionId, plan.events, settlement?.eventMetadata);
  if (settlementSession) {
    await mirrorOneShotSessionBillingToRun(ctx, computeSessionId, settlementSession, settlement);
  }
}

async function scheduleImmediateOneShotTermination(
  ctx: MutationCtx,
  row: Doc<"computeSessions">,
) {
  if (row.idleTimeoutSeconds !== 0) {
    return;
  }
  await ctx.scheduler.runAfter(0, internal.computeSessions.internalTerminateStaleEnvironmentSession, {
    userId: row.userId,
    environmentId: row.environmentId,
    computeSessionId: row._id,
  });
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

export const internalValidateRuntimeToken = internalQuery({
  args: { computeSessionId: v.id("computeSessions"), tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row || !row.runtimeTokenHash || row.runtimeTokenHash === "revoked") {
      return false;
    }
    return row.runtimeTokenHash === args.tokenHash;
  },
});

export const internalGetRuntimeAssignment = internalQuery({
  args: { computeSessionId: v.id("computeSessions") },
  returns: runtimeAssignmentResponseValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row || !row.activeRunId || row.status !== "running") {
      return { run_id: "" };
    }
    const run = await ctx.db.get(row.activeRunId);
    if (!run || TERMINAL_STATUSES.has(run.status)) {
      return { run_id: "" };
    }
    return { run_id: String(row.activeRunId) };
  },
});

export const internalListHeartbeatTimedOut = internalQuery({
  args: { nowMs: v.number(), timeoutSeconds: v.number(), limit: v.optional(v.number()) },
  returns: v.array(timedOutComputeSessionValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const rows = await Promise.all(
      ["idle", "running"].map((status) =>
        ctx.db
          .query("computeSessions")
          .withIndex("by_status", (q) => q.eq("status", status))
          .take(limit),
      ),
    );
    return rows
      .flat()
      .filter((row) =>
        isComputeSessionHeartbeatTimedOut({
          lastHeartbeatAt: row.lastHeartbeatAt,
          providerCreationTime: row.providerCreationTime,
          createdAt: row.createdAt,
          heartbeatTimeoutSeconds: args.timeoutSeconds,
          startupTimeoutSeconds: RUN_CONFIG.startupTimeoutSeconds,
          nowMs: args.nowMs,
        }),
      )
      .slice(0, limit)
      .map((row) => ({
        user_id: row.userId,
        environment_id: String(row.environmentId),
        compute_session_id: String(row._id),
        active_run_id: row.activeRunId ? String(row.activeRunId) : "",
        reason: "heartbeat" as const,
      }));
  },
});

export const internalListIdleTimedOut = internalQuery({
  args: { nowMs: v.number(), limit: v.optional(v.number()) },
  returns: v.array(timedOutComputeSessionValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const rows = await ctx.db
      .query("computeSessions")
      .withIndex("by_status", (q) => q.eq("status", "idle"))
      .take(limit);
    return rows
      .filter((row) =>
        isComputeSessionIdleTimedOut({
          lastIdleAt: row.lastIdleAt,
          idleTimeoutSeconds: row.idleTimeoutSeconds,
          nowMs: args.nowMs,
        }),
      )
      .map((row) => ({
        user_id: row.userId,
        environment_id: String(row.environmentId),
        compute_session_id: String(row._id),
        active_run_id: "",
        reason: "idle" as const,
      }));
  },
});

export const internalMarkIdleIfActiveRunTerminal = internalMutation({
  args: { computeSessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row || row.status !== "running" || !row.activeRunId) {
      return null;
    }
    const run = await ctx.db.get(row.activeRunId);
    if (!run || !TERMINAL_STATUSES.has(run.status)) {
      return null;
    }
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionIdle({ session: toComputeSessionState(row), nowMs: Date.now() }),
    );
    await scheduleImmediateOneShotTermination(ctx, row);
    return null;
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
    gpuType: v.optional(v.string()),
    gpuCount: v.optional(v.number()),
    volumeGb: v.optional(v.number()),
    activateEnvironment: v.optional(v.boolean()),
  },
  returns: computeSessionResponseValidator,
  handler: async (ctx, args) => {
    return createComputeSessionForUserId(ctx, args);
  },
});

export const internalSetRuntimeTokenHash = internalMutation({
  args: { computeSessionId: v.id("computeSessions"), runtimeTokenHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await ctx.db.patch("computeSessions", args.computeSessionId, { runtimeTokenHash: args.runtimeTokenHash });
    return null;
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

export const provisionComputeSession = internalAction({
  args: {
    userId: v.string(),
    computeSessionId: v.id("computeSessions"),
    initialRunId: v.id("runs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.computeSessions.internalGet, {
      userId: args.userId,
      computeSessionId: args.computeSessionId,
    });
    const provisioningPayload = await ctx.runQuery(internal.runs.internalGetProvisioningPayload, {
      runId: args.initialRunId,
    });
    if (provisioningPayload.user_id !== args.userId) {
      throw new Error("compute session user mismatch");
    }
    if (provisioningPayload.environment_id !== session.environment_id) {
      throw new Error("compute session environment mismatch");
    }

    let providerMachineId = "";
    let runtimeTokenHash = "";
    try {
      const codeManifestHash = provisioningPayload.code_manifest_hash;
      const dataManifestHash = provisioningPayload.data_manifest_hash;
      const codeManifestKey = provisioningPayload.code_manifest_key;
      const dataManifestKey = provisioningPayload.data_manifest_key;
      if (!codeManifestHash || !codeManifestKey) {
        throw new Error("missing pinned code manifest hash/key in provisioning payload");
      }

      await fetchSyncManifest(ctx, "code", codeManifestKey, codeManifestHash);
      if (dataManifestHash && dataManifestKey) {
        await fetchSyncManifest(ctx, "data", dataManifestKey, dataManifestHash);
      }

      const environmentEnv = await resolveEnvironmentEnvVarsForEnvironmentId(
        ctx,
        provisioningPayload.environment_id as Id<"environments">,
      );
      const provisionResult = await provisionRuntimeMachine({
        ctx,
        shouldAbort: async () =>
          await ctx.runQuery(internal.runs.internalShouldAbortProvisioning, { runId: args.initialRunId }),
        setRuntimeTokenHash: async (nextRuntimeTokenHash) => {
          runtimeTokenHash = nextRuntimeTokenHash;
          await ctx.runMutation(internal.computeSessions.internalSetRuntimeTokenHash, {
            computeSessionId: args.computeSessionId,
            runtimeTokenHash: nextRuntimeTokenHash,
          });
        },
        createMachine: {
          name: `tahuna-session-${String(args.computeSessionId)}`,
          imageName: session.image_name,
          gpuType: session.effective_gpu_type,
          gpuCount: session.effective_gpu_count,
          volumeGb: session.effective_volume_gb,
        },
        buildEnv: ({ runtimeToken, runtimeApiBase, runtimeRequestTimeoutSeconds }) =>
          buildProvisionedRuntimeEnv({
            defaultEnv: {
              WANDB_API_KEY: runtimeToken,
              WANDB_BASE_URL: resolveWandbBaseURL(runtimeApiBase),
            },
            environmentEnv,
            systemEnv: {
              TAHUNA_COMPUTE_SESSION_ID: String(args.computeSessionId),
              TAHUNA_ENVIRONMENT_ID: provisioningPayload.environment_id,
              TAHUNA_API_BASE: runtimeApiBase,
              TAHUNA_RUNTIME_TOKEN: runtimeToken,
              TAHUNA_WORKSPACE_ROOT: "/workspace",
              TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS: runtimeRequestTimeoutSeconds,
              TAHUNA_CANCELLATION_GRACE_SECONDS: String(RUN_CONFIG.cancellationGraceSeconds),
            },
          }),
      });
      if (!provisionResult) {
        await ctx.runMutation(internal.computeSessions.internalMarkFailed, {
          computeSessionId: args.computeSessionId,
          error: "compute session provisioning aborted",
        });
        return null;
      }

      providerMachineId = provisionResult.providerMachineId;
      if (!runtimeTokenHash) {
        throw new Error("compute session runtime token hash is required");
      }
      await ctx.runMutation(internal.computeSessions.internalMarkMachineProvisioned, {
        computeSessionId: args.computeSessionId,
        providerMachineId: provisionResult.providerMachineId,
        providerCreationTime: provisionResult.providerCreationTime,
        runtimeTokenHash,
      });
      await ctx.runMutation(internal.computeSessions.internalMarkIdle, {
        computeSessionId: args.computeSessionId,
      });
      await ctx.runMutation(internal.computeSessions.internalAssignRun, {
        computeSessionId: args.computeSessionId,
        runId: args.initialRunId,
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "compute session provisioning failed";
      const detail = normalizeProvisioningError(raw);
      await ctx.runMutation(internal.computeSessions.internalMarkFailed, {
        computeSessionId: args.computeSessionId,
        error: detail,
      });
      await ctx.runMutation(internal.runs.markFailed, {
        runId: args.initialRunId,
        error: `runtime bootstrap failed: ${detail}`,
        provisioningPayload,
      });
      if (providerMachineId) {
        await terminateRuntimeMachine(ctx, { providerMachineId });
      }
    }
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

export const internalMarkIdleAfterRun = internalMutation({
  args: { computeSessionId: v.id("computeSessions"), runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row || row.activeRunId !== args.runId) {
      return null;
    }
    const run = await ctx.db.get(args.runId);
    if (!run || !TERMINAL_STATUSES.has(run.status)) {
      return null;
    }
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionIdle({ session: toComputeSessionState(row), nowMs: Date.now() }),
    );
    await scheduleImmediateOneShotTermination(ctx, row);
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
  args: {
    userId: v.string(),
    computeSessionId: v.id("computeSessions"),
    force: v.optional(v.boolean()),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await getAccessibleComputeSession(ctx, args.userId, args.computeSessionId);
    const plan = planComputeSessionStop({
      session: toComputeSessionState(row),
      force: args.force === true,
      reason: args.reason,
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
    await clearEnvironmentActiveComputeSession(ctx, row);
    await applyComputeSessionPlan(
      ctx,
      args.computeSessionId,
      planComputeSessionTerminated({ session: toComputeSessionState(row), nowMs: Date.now() }),
    );
    return null;
  },
});

export const internalClearActiveEnvironmentLink = internalMutation({
  args: { computeSessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await clearEnvironmentActiveComputeSession(ctx, row);
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
    await clearEnvironmentActiveComputeSession(ctx, row);
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

export const internalTerminateTimedOutSession = internalAction({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    computeSessionId: v.id("computeSessions"),
    activeRunId: v.optional(v.id("runs")),
    reason: v.union(v.literal("heartbeat"), v.literal("idle")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.activeRunId) {
      await ctx.runMutation(internal.runs.markFailed, {
        runId: args.activeRunId,
        error: `compute session ${args.reason} timeout`,
      });
    }
    await ctx.runAction(internal.computeSessions.internalTerminateStaleEnvironmentSession, {
      userId: args.userId,
      environmentId: args.environmentId,
      computeSessionId: args.computeSessionId,
    });
    return null;
  },
});

export const internalTerminateInsufficientCreditsSession = internalAction({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    computeSessionId: v.id("computeSessions"),
    activeRunId: v.optional(v.id("runs")),
    serveId: v.optional(v.id("serves")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.activeRunId) {
      await ctx.runMutation(internal.runs.markFailed, {
        runId: args.activeRunId,
        error: "compute session terminated because credits are exhausted",
      });
    }
    if (args.serveId) {
      await ctx.runMutation(internal.serves.markComputeSessionBillingFailed, {
        serveId: args.serveId,
        computeSessionId: args.computeSessionId,
      });
    }
    await ctx.runAction(internal.computeSessions.internalTerminateStaleEnvironmentSession, {
      userId: args.userId,
      environmentId: args.environmentId,
      computeSessionId: args.computeSessionId,
      serveId: args.serveId,
      reason: "insufficient_credits",
    });
    return null;
  },
});

export const enforceComputeSessionHeartbeatTimeouts = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const timedOut = await ctx.runQuery(internal.computeSessions.internalListHeartbeatTimedOut, {
      nowMs: Date.now(),
      timeoutSeconds: RUN_CONFIG.computeSessionHeartbeatTimeoutSeconds,
      limit: 50,
    });
    for (const session of timedOut) {
      await ctx.runAction(internal.computeSessions.internalTerminateTimedOutSession, {
        userId: session.user_id,
        environmentId: session.environment_id as Id<"environments">,
        computeSessionId: session.compute_session_id as Id<"computeSessions">,
        activeRunId: session.active_run_id ? session.active_run_id as Id<"runs"> : undefined,
        reason: session.reason,
      });
    }
    return null;
  },
});

export const enforceComputeSessionIdleTimeouts = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const timedOut = await ctx.runQuery(internal.computeSessions.internalListIdleTimedOut, {
      nowMs: Date.now(),
      limit: 50,
    });
    for (const session of timedOut) {
      await ctx.runAction(internal.computeSessions.internalTerminateTimedOutSession, {
        userId: session.user_id,
        environmentId: session.environment_id as Id<"environments">,
        computeSessionId: session.compute_session_id as Id<"computeSessions">,
        reason: session.reason,
      });
    }
    return null;
  },
});

export const internalRemoveUnprovisioned = internalMutation({
  args: { userId: v.string(), computeSessionId: v.id("computeSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeUnprovisionedComputeSessionForUserId(ctx, args.userId, args.computeSessionId);
    return null;
  },
});

export const internalTerminateStaleEnvironmentSession = internalAction({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    computeSessionId: v.id("computeSessions"),
    serveId: v.optional(v.id("serves")),
    attempt: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(internal.computeSessions.internalGet, {
      userId: args.userId,
      computeSessionId: args.computeSessionId,
    });
    if (
      session.environment_id !== String(args.environmentId) ||
      session.status === "terminated" ||
      session.status === "failed"
    ) {
      return null;
    }

    await ctx.runMutation(internal.computeSessions.internalClearActiveEnvironmentLink, {
      computeSessionId: args.computeSessionId,
    });
    await ctx.runMutation(internal.computeSessions.internalStop, {
      userId: args.userId,
      computeSessionId: args.computeSessionId,
      force: true,
      reason: args.reason,
    });
    if (!session.provider_machine_id) {
      await ctx.runMutation(internal.computeSessions.internalMarkTerminated, {
        computeSessionId: args.computeSessionId,
      });
      if (args.serveId) {
        await ctx.runMutation(internal.serves.markStoppedAfterComputeSessionTermination, {
          serveId: args.serveId,
          computeSessionId: args.computeSessionId,
          force: true,
        });
      }
      return null;
    }

    await terminateRuntimeMachineWithRetry({
      ctx,
      providerMachineId: session.provider_machine_id,
      attempt: args.attempt ?? 0,
      shouldTerminate: async () => {
        let current;
        try {
          current = await ctx.runQuery(internal.computeSessions.internalGet, {
            userId: args.userId,
            computeSessionId: args.computeSessionId,
          });
        } catch {
          return false;
        }
        return (
          current.environment_id === String(args.environmentId) &&
          current.status !== "terminated" &&
          current.status !== "failed"
        );
      },
      onTerminated: async () => {
        await ctx.runMutation(internal.computeSessions.internalMarkTerminated, {
          computeSessionId: args.computeSessionId,
        });
        if (args.serveId) {
          await ctx.runMutation(internal.serves.markStoppedAfterComputeSessionTermination, {
            serveId: args.serveId,
            computeSessionId: args.computeSessionId,
            force: true,
          });
        }
      },
      onRetry: async ({ nextAttempt, error }) => {
        if (nextAttempt < RUN_CONFIG.terminationRetryMaxAttempts) {
          await ctx.scheduler.runAfter(
            RUN_CONFIG.terminationRetryDelaySeconds * 1000,
            internal.computeSessions.internalTerminateStaleEnvironmentSession,
            {
              userId: args.userId,
              environmentId: args.environmentId,
              computeSessionId: args.computeSessionId,
              serveId: args.serveId,
              attempt: nextAttempt,
              reason: args.reason,
            },
          );
          return;
        }
        const failureError = `${error} (retries exhausted)`;
        await ctx.runMutation(internal.computeSessions.internalMarkFailed, {
          computeSessionId: args.computeSessionId,
          error: failureError,
        });
        if (args.serveId) {
          await ctx.runMutation(internal.serves.markComputeSessionTerminationFailed, {
            serveId: args.serveId,
            computeSessionId: args.computeSessionId,
            error: failureError,
          });
        }
      },
    });
    return null;
  },
});
