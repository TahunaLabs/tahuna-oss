import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import {
  initialHostedServeBillingFields,
  settleHostedServeUsage,
  validateHostedServeCreate,
} from "@convex/cloud/serveBilling";
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
