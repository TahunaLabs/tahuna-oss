import { ConvexError } from "convex/values";
import type { MutationCtx } from "@convex/_generated/server";
import { resolveRunComputePricing } from "@/cloud/billing/run-compute-pricing";
import { ensureUserLedger } from "@convex/cloud/credits";
import {
  computeAvailableBalanceCents,
  computeSessionRequiredReservationCents,
  computeSessionReservationRemainingCents,
} from "@convex/cloud/runBilling";
import { COMPUTE_SESSION_STATUS } from "@convex/core/computeSessionLifecyclePlan";

const ACTIVE_COMPUTE_RESERVATION_STATUSES = [
  COMPUTE_SESSION_STATUS.PROVISIONING,
  COMPUTE_SESSION_STATUS.IDLE,
  COMPUTE_SESSION_STATUS.RUNNING,
  COMPUTE_SESSION_STATUS.TERMINATING,
] as const;

function formatUsdCents(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function normalizeReservationCents(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

async function sumActiveComputeSessionReservationCents(ctx: MutationCtx, userId: string) {
  const activeRows = (
    await Promise.all(
      ACTIVE_COMPUTE_RESERVATION_STATUSES.map((status) =>
        ctx.db
          .query("computeSessions")
          .withIndex("by_status", (q) => q.eq("status", status))
          .collect(),
      ),
    )
  ).flat();

  return activeRows
    .filter((row) => row.userId === userId)
    .reduce((total, row) => {
      const storedRemainingCents = normalizeReservationCents(row.computeReservationRemainingCents);
      const remainingCents = storedRemainingCents ?? computeSessionReservationRemainingCents({
        requiredReservationCents: row.computeReservationRequiredCents,
        collectedCents: row.computeCollectedCents,
      });
      return total + remainingCents;
    }, 0);
}

export async function validateHostedComputeSessionCreate(
  ctx: MutationCtx,
  args: {
    userId: string;
    gpuType: string;
    gpuCount: number;
    volumeGb: number;
    launchKind?: "run" | "serve";
  },
) {
  const pricing = resolveRunComputePricing({
    gpuType: args.gpuType,
    gpuCount: args.gpuCount,
    volumeGb: args.volumeGb,
  });
  const requiredReservationCents = computeSessionRequiredReservationCents({
    hourlyRateCents: pricing.hourlyRateCents,
  });
  if (requiredReservationCents <= 0) {
    return;
  }
  const credits = await ensureUserLedger(ctx, {
    userId: args.userId,
    source: "compute_session_launch",
  });
  const activeReservationCents = await sumActiveComputeSessionReservationCents(ctx, args.userId);
  const availableBalanceCents = computeAvailableBalanceCents({
    ledgerBalanceCents: credits.balanceCents,
    activeReservationCents,
  });
  if (availableBalanceCents < requiredReservationCents) {
    const launchKind = args.launchKind ?? "run";
    throw new ConvexError(
      `insufficient credits: add at least ${formatUsdCents(requiredReservationCents - availableBalanceCents)} before launching this ${launchKind}`,
    );
  }
}
