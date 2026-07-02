import { ConvexError } from "convex/values";
import { internal } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { PYTHON_CONFIG, RUN_CONFIG } from "@convex/appConfig";
import {
  initialHostedComputeSessionBillingFieldsForSpec,
  validateHostedComputeSessionCreate,
} from "@convex/cloud/billing";
import {
  planComputeSessionCreation,
  TERMINAL_COMPUTE_SESSION_STATUSES,
  type ComputeSessionEvent,
} from "@convex/core/computeSessionLifecyclePlan";
import { toComputeSessionResponse } from "@convex/computeSessionsRead";
import { getAccessibleEnvironment } from "@convex/runsAccess";
import { resolveImageName } from "@convex/runtimeProvisioning";

function normalizeIdleTimeoutSeconds(value: number | undefined) {
  const resolved = value ?? RUN_CONFIG.computeSessionDefaultIdleTimeoutSeconds;
  if (!Number.isInteger(resolved) || resolved < 0) {
    throw new ConvexError("idle_timeout_seconds must be a non-negative integer");
  }
  if (resolved > RUN_CONFIG.computeSessionMaxIdleTimeoutSeconds) {
    throw new ConvexError(
      `idle_timeout_seconds must be <= ${RUN_CONFIG.computeSessionMaxIdleTimeoutSeconds}`,
    );
  }
  return resolved;
}

function compactEventMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) {
    return undefined;
  }
  const compact = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
  return Object.keys(compact).length > 0 ? compact : undefined;
}

export async function insertComputeSessionEvents(
  ctx: MutationCtx,
  computeSessionId: Id<"computeSessions">,
  events: ComputeSessionEvent[] | undefined,
  terminalMetadata?: Record<string, unknown>,
) {
  for (const event of events ?? []) {
    const metadata = compactEventMetadata(
      TERMINAL_COMPUTE_SESSION_STATUSES.has(event.status)
        ? { ...(event.metadata || {}), ...(terminalMetadata || {}) }
        : event.metadata,
    );
    await ctx.db.insert("computeSessionEvents", {
      computeSessionId,
      status: event.status,
      message: event.message,
      ...(metadata ? { metadata } : {}),
    });
  }
}

export async function clearEnvironmentActiveComputeSession(
  ctx: MutationCtx,
  row: Doc<"computeSessions">,
) {
  const env = await ctx.db.get(row.environmentId);
  if (env?.activeComputeSessionId === row._id) {
    await ctx.db.patch(row.environmentId, { activeComputeSessionId: undefined });
  }
}

export async function createComputeSessionForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    idleTimeoutSeconds?: number;
    gpuType?: string;
    gpuCount?: number;
    volumeGb?: number;
    pythonVersion?: string;
    activateEnvironment?: boolean;
  },
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const pythonVersion = args.pythonVersion || env.pythonVersion || PYTHON_CONFIG.defaultVersion;
  const idleTimeoutSeconds = normalizeIdleTimeoutSeconds(args.idleTimeoutSeconds);
  const imageName = resolveImageName(env.framework, env.version, pythonVersion);
  const effectiveGpuType = args.gpuType ?? env.gpuType;
  const effectiveGpuCount = args.gpuCount ?? env.gpuCount;
  const effectiveVolumeGb = args.volumeGb ?? env.volumeGb;
  await validateHostedComputeSessionCreate(ctx, {
    userId: args.userId,
    gpuType: effectiveGpuType,
    gpuCount: effectiveGpuCount,
    volumeGb: effectiveVolumeGb,
  });
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
    ...initialHostedComputeSessionBillingFieldsForSpec({
      gpuType: effectiveGpuType,
      gpuCount: effectiveGpuCount,
      volumeGb: effectiveVolumeGb,
    }),
  });
  const activateEnvironment = args.activateEnvironment !== false;
  if (activateEnvironment) {
    if (env.activeComputeSessionId && env.activeComputeSessionId !== computeSessionId) {
      await ctx.scheduler.runAfter(0, internal.computeSessions.internalTerminateStaleEnvironmentSession, {
        userId: args.userId,
        environmentId: args.environmentId,
        computeSessionId: env.activeComputeSessionId,
      });
    }
    await ctx.db.patch(args.environmentId, { activeComputeSessionId: computeSessionId });
  }
  await insertComputeSessionEvents(ctx, computeSessionId, [plan.event]);
  const row = await ctx.db.get("computeSessions", computeSessionId);
  if (!row) {
    throw new ConvexError("failed to create compute session");
  }
  return toComputeSessionResponse(row);
}

export async function removeUnprovisionedComputeSessionForUserId(
  ctx: MutationCtx,
  userId: string,
  computeSessionId: Id<"computeSessions">,
) {
  const row = await ctx.db.get("computeSessions", computeSessionId);
  if (!row || row.userId !== userId || row.providerMachineId) {
    return;
  }
  await clearEnvironmentActiveComputeSession(ctx, row);
  const events = await ctx.db
    .query("computeSessionEvents")
    .withIndex("by_compute_session", (q) => q.eq("computeSessionId", computeSessionId))
    .collect();
  for (const event of events) {
    await ctx.db.delete(event._id);
  }
  await ctx.db.delete(computeSessionId);
}
