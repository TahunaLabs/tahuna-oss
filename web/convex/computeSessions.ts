import { ConvexError, v } from "convex/values";
import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { RUN_CONFIG, PYTHON_CONFIG } from "@convex/appConfig";
import { assignQueuedRunToComputeSession } from "@convex/computeSessionAssignment";
import {
  buildProvisionedRuntimeEnv,
  resolveEnvironmentEnvVarsForEnvironmentId,
} from "@convex/envVars";
import { getAccessibleEnvironment } from "@convex/runsAccess";
import {
  provisionRuntimeMachine,
  resolveImageName,
  resolveWandbBaseURL,
  terminateRuntimeMachine,
} from "@convex/runtimeProvisioning";
import { fetchSyncManifest } from "@convex/runtimeBootstrap";
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
    gpuType?: string;
    gpuCount?: number;
    volumeGb?: number;
  },
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const pythonVersion = env.pythonVersion || PYTHON_CONFIG.defaultVersion;
  const idleTimeoutSeconds = normalizeIdleTimeoutSeconds(args.idleTimeoutSeconds);
  const imageName = resolveImageName(env.framework, env.version, pythonVersion);
  const effectiveGpuType = args.gpuType ?? env.gpuType;
  const effectiveGpuCount = args.gpuCount ?? env.gpuCount;
  const effectiveVolumeGb = args.volumeGb ?? env.volumeGb;
  const now = Date.now();
  const plan = planComputeSessionCreation({
    nowMs: now,
    userId: args.userId,
    environmentId: String(args.environmentId),
    effectiveGpuType,
    effectiveGpuCount,
    effectiveVolumeGb,
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
    gpuType: v.optional(v.string()),
    gpuCount: v.optional(v.number()),
    volumeGb: v.optional(v.number()),
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
      const detail = error instanceof Error ? error.message : "compute session provisioning failed";
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
