import { ConvexError, v } from "convex/values";
import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { internalMutation, mutation, query } from "@convex/_generated/server";
import { CLOUD_BILLING_CONFIG } from "@/cloud/config";
import { authComponent, requireUser } from "@convex/auth";
import {
  ensureUserLedger,
  upsertLedgerDebitTotal,
  USAGE_EVENT_TYPE,
} from "@convex/cloud/credits";
import {
  estimateRunUsageFromHourlyRateCents,
  resolveRunHourlyRateCents,
  resolveTerminalRunTiming,
  runLiveDebitIdempotencyKey,
  settleRunComputeCharge,
  toUnixMillis,
  type ComputeSettlementResult,
} from "@convex/cloud/runBilling";
import { RUN_STATUS } from "@convex/runsConstants";

const HOSTED_BILLING_CLIENT_ERROR_PATTERNS: RegExp[] = [
  /\binsufficient credits\b/i,
  /\bcompute provider account balance is insufficient\b/i,
];

export function isHostedBillingClientError(value: string) {
  return HOSTED_BILLING_CLIENT_ERROR_PATTERNS.some((pattern) => pattern.test(value));
}

export function hostedBillingHttpStatus(value: string, fallbackStatus: number) {
  return isHostedBillingClientError(value) ? 402 : fallbackStatus;
}

export type HostedRunBillingPatch = {
  computeEndedAt?: number;
  computeChargeCents: number;
  computeCollectedCents: number;
  computeOutstandingCents: number;
  computeChargeStatus: "charged" | "owed";
  computeChargeError?: string;
};

export type HostedRunUsageSettlement = {
  patch: HostedRunBillingPatch;
  eventMetadata: Record<string, number | string | undefined>;
  terminalTiming: { computeEndedAt?: number; durationMs: number };
  settlement: ComputeSettlementResult;
};

export function initialHostedRunBillingFields(hourlyRateCents: number) {
  return {
    computeHourlyRateCents: hourlyRateCents,
    creditsReservedCents: 0,
    computeChargeCents: 0,
    computeCollectedCents: 0,
    computeOutstandingCents: 0,
    computeChargeStatus: "pending" as const,
  };
}

export async function settleHostedRunUsage(
  ctx: MutationCtx,
  row: Doc<"runs">,
): Promise<HostedRunUsageSettlement> {
  const terminalTiming = resolveTerminalRunTiming(row);
  const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
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

export const getMyCredits = query({
  args: {},
  returns: v.object({
    balance_cents: v.number(),
    currency: v.string(),
    initialized: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const userId = String(user._id);
    const row = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) {
      return {
        balance_cents: 0,
        currency: CLOUD_BILLING_CONFIG.currency,
        initialized: false,
      };
    }
    return {
      balance_cents: row.balanceCents,
      currency: row.currency || CLOUD_BILLING_CONFIG.currency,
      initialized: true,
    };
  },
});

export const listMyUsageEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      event_type: v.string(),
      credits_delta_cents: v.number(),
      balance_after_cents: v.number(),
      reference_type: v.union(v.string(), v.null()),
      reference_id: v.union(v.string(), v.null()),
      metadata: v.union(v.any(), v.null()),
      created_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const userId = String(user._id);
    const rawLimit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : 100;
    const limit = Math.max(1, Math.min(200, rawLimit));
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_user_and_created_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      event_type: row.eventType,
      credits_delta_cents: row.creditsDeltaCents,
      balance_after_cents: row.balanceAfterCents,
      reference_type: row.referenceType ?? null,
      reference_id: row.referenceId ?? null,
      metadata: row.metadata ?? null,
      created_at: row.createdAt,
    }));
  },
});

export const ensureMyBillingAccount = mutation({
  args: {},
  returns: v.object({
    balance_cents: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await ensureUserLedger(ctx, {
      userId: String(user._id),
      source: "dashboard_bootstrap",
    });
    return {
      balance_cents: row.balanceCents,
      currency: row.currency,
    };
  },
});

export const billRunningComputeMinute = internalMutation({
  args: {},
  returns: v.object({
    processed_runs: v.number(),
    charged_runs: v.number(),
    owed_runs: v.number(),
    skipped_runs: v.number(),
  }),
  handler: async (ctx) => {
    const nowMs = Date.now();
    const runningRuns = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", RUN_STATUS.RUNNING))
      .collect();

    let processedRuns = 0;
    let chargedRuns = 0;
    let owedRuns = 0;
    let skippedRuns = 0;

    for (const row of runningRuns) {
      const startedAt = typeof row.computeStartedAt === "number" ? toUnixMillis(row.computeStartedAt) : 0;
      if (startedAt <= 0) {
        skippedRuns += 1;
        continue;
      }

      const durationMs = Math.max(0, nowMs - startedAt);
      let hourlyRateCents = 0;
      try {
        hourlyRateCents = resolveRunHourlyRateCents(row);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "run hourly rate is invalid";
        await ctx.db.patch("runs", row._id, {
          computeChargeStatus: "owed",
          computeChargeError: detail,
        });
        owedRuns += 1;
        continue;
      }

      const targetChargeCents = estimateRunUsageFromHourlyRateCents({
        hourlyRateCents,
        durationMs,
      });
      const runId = String(row._id);
      const currentCollectedCents = Math.max(0, Math.floor(row.computeCollectedCents || 0));
      const debitDeltaCents = targetChargeCents - currentCollectedCents;
      let nextCollectedCents = currentCollectedCents;
      let nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
      let nextChargeStatus: "pending" | "charged" | "owed" =
        targetChargeCents > 0 ? (nextOutstandingCents > 0 ? "owed" : "charged") : "pending";
      let nextChargeError: string | undefined = undefined;

      if (debitDeltaCents > 0) {
        const appliedDebit = await upsertLedgerDebitTotal(ctx, {
          userId: row.userId,
          targetDebitCents: targetChargeCents,
          eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_DEBIT,
          idempotencyKey: runLiveDebitIdempotencyKey(runId),
          referenceType: "run",
          referenceId: runId,
          metadata: {
            settlement: "live_tick",
            charge_cents: targetChargeCents,
            duration_ms: durationMs,
            gpu_type: row.effectiveGpuType,
            gpu_count: row.effectiveGpuCount,
            volume_gb: row.effectiveVolumeGb,
            hourly_rate_cents: hourlyRateCents,
          },
        });
        nextCollectedCents = Math.min(targetChargeCents, appliedDebit.debitedCents);
        if (nextCollectedCents > currentCollectedCents) {
          chargedRuns += 1;
        }
      }

      nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
      if (nextOutstandingCents > 0) {
        nextChargeStatus = "owed";
        nextChargeError = "outstanding compute settlement";
        owedRuns += 1;
      } else if (targetChargeCents > 0) {
        nextChargeStatus = "charged";
      } else {
        nextChargeStatus = "pending";
      }

      const previousChargeCents = Math.max(0, Math.floor(row.computeChargeCents || 0));
      const previousCollectedCents = Math.max(0, Math.floor(row.computeCollectedCents || 0));
      const previousOutstandingCents = Math.max(0, Math.floor(row.computeOutstandingCents || 0));
      const previousChargeStatus = row.computeChargeStatus || "pending";
      const previousChargeError = row.computeChargeError;
      if (
        previousChargeCents !== targetChargeCents ||
        previousCollectedCents !== nextCollectedCents ||
        previousOutstandingCents !== nextOutstandingCents ||
        previousChargeStatus !== nextChargeStatus ||
        previousChargeError !== nextChargeError
      ) {
        await ctx.db.patch("runs", row._id, {
          computeChargeCents: targetChargeCents,
          computeCollectedCents: nextCollectedCents,
          computeOutstandingCents: nextOutstandingCents,
          computeChargeStatus: nextChargeStatus,
          computeChargeError: nextChargeError,
        });
        processedRuns += 1;
      } else {
        skippedRuns += 1;
      }
    }

    return {
      processed_runs: processedRuns,
      charged_runs: chargedRuns,
      owed_runs: owedRuns,
      skipped_runs: skippedRuns,
    };
  },
});
