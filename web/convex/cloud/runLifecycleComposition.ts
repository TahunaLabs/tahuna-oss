import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { resolveRunComputePricing } from "@/cloud/billing/run-compute-pricing";
import {
  initialHostedRunBillingFields,
  settleHostedRunUsage,
} from "@convex/cloud/billing";
import {
  applyRunLifecyclePlan,
  cancelRunForUserId,
  createRunForUserId,
  deleteRunForUserId,
  type RunLifecycleComposition,
} from "@convex/runsLifecycle";
import type { RunLifecyclePlan } from "@convex/core/runLifecyclePlan";

export const hostedRunLifecycleComposition: RunLifecycleComposition = {
  createRun(args) {
    const pricing = resolveRunComputePricing({
      gpuType: args.gpuType,
      gpuCount: args.gpuCount,
      volumeGb: args.volumeGb,
    });
    return {
      runFields: initialHostedRunBillingFields(pricing.hourlyRateCents),
      eventMetadata: {
        hourly_rate_cents: pricing.hourlyRateCents,
      },
    };
  },
  settleTerminalRunUsage(ctx, row) {
    return settleHostedRunUsage(ctx, row);
  },
};

export function applyHostedRunLifecyclePlan(
  ctx: MutationCtx,
  runId: Id<"runs">,
  row: Doc<"runs">,
  plan: RunLifecyclePlan,
) {
  return applyRunLifecyclePlan(ctx, runId, row, plan, hostedRunLifecycleComposition);
}

export function createHostedRunForUserId(
  ctx: MutationCtx,
  args: Parameters<typeof createRunForUserId>[1],
) {
  return createRunForUserId(ctx, args, hostedRunLifecycleComposition);
}

export function cancelHostedRunForUserId(
  ctx: MutationCtx,
  userId: string,
  runId: Id<"runs">,
  force: boolean,
) {
  return cancelRunForUserId(ctx, userId, runId, force, hostedRunLifecycleComposition);
}

export function deleteHostedRunForUserId(
  ctx: MutationCtx,
  userId: string,
  runId: Id<"runs">,
  options?: { cancelActive?: boolean; force?: boolean },
) {
  return deleteRunForUserId(ctx, userId, runId, options, hostedRunLifecycleComposition);
}
