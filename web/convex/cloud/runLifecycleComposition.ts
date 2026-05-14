import { ConvexError } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { estimateRunLaunchCents, resolveRunComputePricing } from "@/cloud/billing/run-compute-pricing";
import { BILLING_MODE, runBillingMode } from "@convex/core/billingMode";
import {
  initialHostedRunBillingFields,
  settleHostedRunUsage,
} from "@convex/cloud/billing";
import { ensureUserLedger } from "@convex/cloud/credits";
import {
  applyRunLifecyclePlan,
  cancelRunForUserId,
  createRunForUserId,
  deleteRunForUserId,
  type RunLifecycleComposition,
} from "@convex/runsLifecycle";
import type { RunLifecyclePlan } from "@convex/core/runLifecyclePlan";

function formatUsdCents(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export const hostedRunLifecycleComposition: RunLifecycleComposition = {
  async validateCreateRun(ctx, args) {
    if (args.billingMode !== BILLING_MODE.MANAGED) {
      return;
    }
    const estimateCents = estimateRunLaunchCents({
      gpuType: args.gpuType,
      gpuCount: args.gpuCount,
      volumeGb: args.volumeGb,
    });
    if (estimateCents <= 0) {
      return;
    }
    const credits = await ensureUserLedger(ctx, {
      userId: args.userId,
      source: "run_launch",
    });
    if (credits.balanceCents < estimateCents) {
      throw new ConvexError(
        `insufficient credits: add at least ${formatUsdCents(estimateCents - credits.balanceCents)} before launching this run`,
      );
    }
  },
  createRun(args) {
    if (args.billingMode !== BILLING_MODE.MANAGED) {
      return {};
    }
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
  async settleTerminalRunUsage(ctx, row) {
    if (runBillingMode(row) !== BILLING_MODE.MANAGED) {
      return undefined;
    }
    return await settleHostedRunUsage(ctx, row);
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
