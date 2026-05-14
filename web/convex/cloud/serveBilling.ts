import { ConvexError } from "convex/values";
import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { estimateRunLaunchCents, resolveRunComputePricing } from "@/cloud/billing/run-compute-pricing";
import { ensureUserLedger } from "@convex/cloud/credits";
import {
  resolveTerminalRunTiming,
  settleServeComputeCharge,
  type ComputeSettlementResult,
} from "@convex/cloud/runBilling";

export type HostedServeBillingPatch = {
  computeEndedAt?: number;
  computeChargeCents: number;
  computeCollectedCents: number;
  computeOutstandingCents: number;
  computeChargeStatus: "charged" | "owed";
  computeChargeError?: string;
};

export type HostedServeUsageSettlement = {
  patch: HostedServeBillingPatch;
  eventMetadata: Record<string, number | string | undefined>;
  terminalTiming: { computeEndedAt?: number; durationMs: number };
  settlement: ComputeSettlementResult;
};

function formatUsdCents(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

export async function validateHostedServeCreate(
  ctx: MutationCtx,
  args: {
    userId: string;
    gpuType: string;
    gpuCount: number;
    volumeGb: number;
  },
) {
  const estimateCents = estimateRunLaunchCents(args);
  if (estimateCents <= 0) {
    return;
  }
  const credits = await ensureUserLedger(ctx, {
    userId: args.userId,
    source: "serve_launch",
  });
  if (credits.balanceCents < estimateCents) {
    throw new ConvexError(
      `insufficient credits: add at least ${formatUsdCents(estimateCents - credits.balanceCents)} before launching this serve`,
    );
  }
}

export function initialHostedServeBillingFields(args: {
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
}) {
  const pricing = resolveRunComputePricing(args);
  return {
    computeHourlyRateCents: pricing.hourlyRateCents,
    creditsReservedCents: 0,
    computeChargeCents: 0,
    computeCollectedCents: 0,
    computeOutstandingCents: 0,
    computeChargeStatus: "pending" as const,
  };
}

export async function settleHostedServeUsage(
  ctx: MutationCtx,
  row: Doc<"serves">,
): Promise<HostedServeUsageSettlement> {
  const terminalTiming = resolveTerminalRunTiming(row);
  const settlement = await settleServeComputeCharge(ctx, row, terminalTiming);
  return {
    patch: {
      computeEndedAt: terminalTiming.computeEndedAt,
      computeChargeCents: settlement.chargeCents,
      computeCollectedCents: settlement.collectedCents,
      computeOutstandingCents: settlement.outstandingCents,
      computeChargeStatus: settlement.chargeStatus,
      computeChargeError: settlement.chargeError,
    },
    eventMetadata: {
      duration_ms: terminalTiming.durationMs,
      compute_charge_cents: settlement.chargeCents,
      compute_charge_delta_cents: settlement.chargeDeltaCents,
      compute_charge_status: settlement.chargeStatus,
      compute_charge_error: settlement.chargeError,
      balance_after_cents: settlement.balanceAfterCents,
    },
    terminalTiming,
    settlement,
  };
}
