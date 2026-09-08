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
  type QueryCtx,
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
  planComputeSessionServing,
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
import { applyHostedRunLifecyclePlan } from "@convex/cloud/runLifecycleComposition";
import {
  listComputeSessionEvents,
  listComputeSessionsByUserId,
  toComputeSessionResponse,
} from "@convex/computeSessionsRead";
import { planRunFailure } from "@convex/core/runLifecyclePlan";
import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "@convex/runsConstants";
import { toRunLifecycleState } from "@convex/runsLifecycle";

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
const terminationTimedOutComputeSessionValidator = v.object({
  user_id: v.string(),
  environment_id: v.string(),
  compute_session_id: v.string(),
});
const TIMEOUT_SWEEP_SCAN_LIMIT = 500;

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

async function failRunForTerminatingComputeSession(
  ctx: MutationCtx,
  run: Doc<"runs"> | null,
  error: string,
  seenRunIds: Set<string>,
) {
  if (!run || TERMINAL_STATUSES.has(run.status)) {
    return;
  }
  const runId = String(run._id);
  if (seenRunIds.has(runId)) {
    return;
  }
  seenRunIds.add(runId);
  await applyHostedRunLifecyclePlan(
    ctx,
    run._id,
    run,
    planRunFailure({
      run: toRunLifecycleState(run),
      error,
    }),
  );
}

async function failRunsAttachedToTerminatingComputeSession(
  ctx: MutationCtx,
  row: Doc<"computeSessions">,
  error: string,
) {
  const seenRunIds = new Set<string>();
  if (row.activeRunId) {
    await failRunForTerminatingComputeSession(
      ctx,
      await ctx.db.get(row.activeRunId),
      error,
      seenRunIds,
    );
  }
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_compute_session", (q) => q.eq("computeSessionId", row._id))
    .take(10);
  for (const run of runs) {
    if (ACTIVE_STATUSES.has(run.status)) {
      await failRunForTerminatingComputeSession(ctx, run, error, seenRunIds);
    }
  }
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

function isComputeSessionTerminationTimedOut(args: {
  terminatingSince?: number | null;
  lastHeartbeatAt?: number | null;
  computeStartedAt?: number | null;
  createdAt: number;
  timeoutSeconds: number;
  nowMs: number;
}) {
  const since = args.terminatingSince ?? args.lastHeartbeatAt ?? args.computeStartedAt ?? args.createdAt;
  return since + args.timeoutSeconds * 1000 <= args.nowMs;
}

async function collectComputeSessionTimeoutMatches<TResult>(
  ctx: QueryCtx,
  args: {
    status: string;
    limit: number;
    matches: TResult[];
    isMatch: (row: Doc<"computeSessions">) => boolean;
    toResult: (row: Doc<"computeSessions">) => TResult;
  },
) {
  let cursor: string | null = null;
  let scannedRows = 0;
  while (args.matches.length < args.limit && scannedRows < TIMEOUT_SWEEP_SCAN_LIMIT) {
    const remainingScanRows = TIMEOUT_SWEEP_SCAN_LIMIT - scannedRows;
    const result = await ctx.db
      .query("computeSessions")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .paginate({ cursor, numItems: Math.min(100, remainingScanRows) });
    scannedRows += result.page.length;
    for (const row of result.page) {
      if (args.isMatch(row)) {
        args.matches.push(args.toResult(row));
        if (args.matches.length >= args.limit) {
          break;
        }
      }
    }
    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }
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
    const matches: Array<{
      user_id: string;
      environment_id: string;
      compute_session_id: string;
      active_run_id: string;
      reason: "heartbeat";
    }> = [];
    for (const status of ["idle", "running"]) {
      await collectComputeSessionTimeoutMatches(ctx, {
        status,
        limit,
        matches,
        isMatch: (row) =>
          isComputeSessionHeartbeatTimedOut({
            lastHeartbeatAt: row.lastHeartbeatAt,
            providerCreationTime: row.providerCreationTime,
            createdAt: row.createdAt,
            heartbeatTimeoutSeconds: args.timeoutSeconds,
            startupTimeoutSeconds: RUN_CONFIG.startupTimeoutSeconds,
            nowMs: args.nowMs,
          }),
        toResult: (row) => ({
          user_id: row.userId,
          environment_id: String(row.environmentId),
          compute_session_id: String(row._id),
          active_run_id: row.activeRunId ? String(row.activeRunId) : "",
          reason: "heartbeat" as const,
        }),
      });
      if (matches.length >= limit) {
        break;
      }
    }
    return matches;
  },
});

export const internalListIdleTimedOut = internalQuery({
  args: { nowMs: v.number(), limit: v.optional(v.number()) },
  returns: v.array(timedOutComputeSessionValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const matches: Array<{
      user_id: string;
      environment_id: string;
      compute_session_id: string;
      active_run_id: string;
      reason: "idle";
    }> = [];
    await collectComputeSessionTimeoutMatches(ctx, {
      status: "idle",
      limit,
      matches,
      isMatch: (row) =>
        isComputeSessionIdleTimedOut({
          lastIdleAt: row.lastIdleAt,
          idleTimeoutSeconds: row.idleTimeoutSeconds,
          nowMs: args.nowMs,
        }),
      toResult: (row) => ({
        user_id: row.userId,
        environment_id: String(row.environmentId),
        compute_session_id: String(row._id),
        active_run_id: "",
        reason: "idle" as const,
      }),
    });
    return matches;
  },
});

export const internalListTerminationTimedOut = internalQuery({
  args: { nowMs: v.number(), timeoutSeconds: v.number(), limit: v.optional(v.number()) },
  returns: v.array(terminationTimedOutComputeSessionValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(100, Math.floor(args.limit ?? 50)));
    const matches: Array<{
      user_id: string;
      environment_id: string;
      compute_session_id: string;
    }> = [];
    await collectComputeSessionTimeoutMatches(ctx, {
      status: "terminating",
      limit,
      matches,
      isMatch: (row) =>
        isComputeSessionTerminationTimedOut({
          terminatingSince: row.terminatingSince,
          lastHeartbeatAt: row.lastHeartbeatAt,
          computeStartedAt: row.computeStartedAt,
          createdAt: row.createdAt,
          timeoutSeconds: args.timeoutSeconds,
          nowMs: args.nowMs,
        }),
      toResult: (row) => ({
        user_id: row.userId,
        environment_id: String(row.environmentId),
        compute_session_id: String(row._id),
      }),
    });
    return matches;
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
    if (run && !TERMINAL_STATUSES.has(run.status)) {
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

export const internalRecordOrphanedMachineTermination = internalMutation({
  args: {
    computeSessionId: v.id("computeSessions"),
    providerMachineId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return null;
    }
    await ctx.db.insert("computeSessionEvents", {
      computeSessionId: args.computeSessionId,
      status: "terminated",
      message: "terminated machine provisioned after session termination",
      metadata: {
        provider_machine_id: args.providerMachineId,
      },
    });
    return null;
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
  returns: v.object({ recorded: v.boolean() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("computeSessions", args.computeSessionId);
    if (!row) {
      return { recorded: false };
    }
    const plan = planComputeSessionMachineProvisioned({
      session: toComputeSessionState(row),
      providerMachineId: args.providerMachineId,
      providerCreationTime: args.providerCreationTime,
      runtimeTokenHash: args.runtimeTokenHash,
      nowMs: Date.now(),
    });
    if (!plan.patch) {
      return { recorded: false };
    }
    await applyComputeSessionPlan(ctx, args.computeSessionId, plan);
    return { recorded: true };
  },
});

export const internalMarkServingSession = internalMutation({
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
      planComputeSessionServing({ session: toComputeSessionState(row) }),
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
      const machineProvisioning = await ctx.runMutation(internal.computeSessions.internalMarkMachineProvisioned, {
        computeSessionId: args.computeSessionId,
        providerMachineId: provisionResult.providerMachineId,
        providerCreationTime: provisionResult.providerCreationTime,
        runtimeTokenHash,
      });
      if (!machineProvisioning.recorded) {
        await terminateRuntimeMachine(ctx, { providerMachineId: provisionResult.providerMachineId });
        await ctx.runMutation(internal.runs.markFailed, {
          runId: args.initialRunId,
          error: "compute session terminated during provisioning",
          provisioningPayload,
        });
        return null;
      }
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
    if (run && !TERMINAL_STATUSES.has(run.status)) {
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
    await failRunsAttachedToTerminatingComputeSession(ctx, row, "compute session terminated");
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
    await failRunsAttachedToTerminatingComputeSession(ctx, row, `compute session failed: ${args.error}`);
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

export const enforceComputeSessionTerminationTimeouts = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const timedOut = await ctx.runQuery(internal.computeSessions.internalListTerminationTimedOut, {
      nowMs: Date.now(),
      timeoutSeconds: RUN_CONFIG.computeSessionTerminatingTimeoutSeconds,
      limit: 50,
    });
    for (const session of timedOut) {
      await ctx.runAction(internal.computeSessions.internalTerminateStaleEnvironmentSession, {
        userId: session.user_id,
        environmentId: session.environment_id as Id<"environments">,
        computeSessionId: session.compute_session_id as Id<"computeSessions">,
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
