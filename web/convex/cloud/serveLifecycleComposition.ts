import type { Doc, Id } from "@convex/_generated/dataModel";
import { internal } from "@convex/_generated/api";
import type { MutationCtx } from "@convex/_generated/server";
import {
  initialHostedServeBillingFields,
  settleHostedServeUsage,
  validateHostedServeCreate,
} from "@convex/cloud/serveBilling";
import { createComputeSessionForUserId } from "@convex/computeSessionsLifecycle";
import {
  applyServeLifecyclePlan,
  createServeForUserId,
  stopServeForUserId,
  type ServeLifecycleComposition,
} from "@convex/servesLifecycle";
import type { ServeLifecyclePlan } from "@convex/core/serveLifecyclePlan";

export const hostedServeLifecycleComposition: ServeLifecycleComposition = {
  async validateCreateServe(ctx, args) {
    await validateHostedServeCreate(ctx, args);
  },
  createServe(args) {
    const fields = initialHostedServeBillingFields(args);
    return {
      serveFields: fields,
      eventMetadata: {
        hourly_rate_cents: fields.computeHourlyRateCents,
      },
    };
  },
  async createComputeSession(ctx, args) {
    const session = await createComputeSessionForUserId(ctx, {
      userId: args.userId,
      environmentId: args.environmentId,
      idleTimeoutSeconds: 0,
      gpuType: args.serveConfig.gpuType,
      gpuCount: args.serveConfig.gpuCount,
      volumeGb: args.serveConfig.volumeGb,
      pythonVersion: args.serveConfig.pythonVersion,
      activateEnvironment: false,
    });
    return {
      computeSessionId: session.compute_session_id as Id<"computeSessions">,
      eventMetadata: {
        compute_session_id: session.compute_session_id,
      },
    };
  },
  async linkComputeSessionToServe(ctx, args) {
    await ctx.db.patch("computeSessions", args.computeSessionId, {
      serveId: args.serveId,
    });
  },
  async stopComputeSession(ctx, args) {
    await ctx.scheduler.runAfter(0, internal.computeSessions.internalTerminateStaleEnvironmentSession, {
      userId: args.userId,
      environmentId: args.environmentId,
      computeSessionId: args.computeSessionId,
      serveId: args.serveId,
      reason: "user_stop",
    });
  },
  async settleTerminalServeUsage(ctx, row) {
    return await settleHostedServeUsage(ctx, row);
  },
};

export function applyHostedServeLifecyclePlan(
  ctx: MutationCtx,
  serveId: Id<"serves">,
  row: Doc<"serves">,
  plan: ServeLifecyclePlan,
) {
  return applyServeLifecyclePlan(ctx, serveId, row, plan, hostedServeLifecycleComposition);
}

export function createHostedServeForUserId(
  ctx: MutationCtx,
  args: Parameters<typeof createServeForUserId>[1],
) {
  return createServeForUserId(ctx, args, hostedServeLifecycleComposition);
}

export function stopHostedServeForUserId(
  ctx: MutationCtx,
  userId: string,
  serveId: Id<"serves">,
  force: boolean,
) {
  return stopServeForUserId(ctx, userId, serveId, force, hostedServeLifecycleComposition);
}
