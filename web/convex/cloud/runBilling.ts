import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { resolveRunComputePricing } from "@/cloud/billing/run-compute-pricing";
import { CLOUD_BILLING_CONFIG } from "@/cloud/config";
import { toUnixMillis as toCoreUnixMillis } from "@convex/core/runTiming";
import {
  grantUserCredits,
  recordLedgerEvent,
  upsertLedgerDebitTotal,
  USAGE_EVENT_TYPE,
} from "@convex/cloud/credits";

const MS_PER_MINUTE = 60 * 1000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

export { resolveRunUptimeMs, resolveTerminalRunTiming, toUnixMillis } from "@convex/core/runTiming";

function toOptionalUnixMillis(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

export type ComputeSettlementResult = {
  chargeCents: number;
  chargeStatus: "charged" | "owed";
  chargeError?: string;
  chargeDeltaCents: number;
  balanceAfterCents?: number;
  collectedCents: number;
  outstandingCents: number;
  durationMs: number;
  hourlyRateCents: number;
};

function runSettlementIdempotencyKey(runId: string, kind: "debit" | "refund" | "owed") {
  return `run:${runId}:settlement:${kind}`;
}

export function runLiveDebitIdempotencyKey(runId: string) {
  return `run:${runId}:live_debit`;
}

export function toMinuteBucketUnixMs(value: number) {
  return Math.floor(toCoreUnixMillis(value) / MS_PER_MINUTE) * MS_PER_MINUTE;
}

export function estimateRunUsageFromHourlyRateCents(args: {
  hourlyRateCents: number;
  durationMs: number | undefined;
}) {
  const hourlyRateCents = Math.max(0, Math.floor(args.hourlyRateCents));
  const durationMs = toOptionalUnixMillis(args.durationMs);
  if (hourlyRateCents <= 0 || durationMs === undefined || durationMs <= 0) {
    return 0;
  }
  const usageCents = Math.ceil((hourlyRateCents * durationMs) / MS_PER_HOUR);
  return Math.max(CLOUD_BILLING_CONFIG.minimumChargeCents, usageCents);
}

export function resolveRunHourlyRateCents(run: {
  computeHourlyRateCents?: number;
  effectiveGpuType?: string;
  effectiveGpuCount?: number;
  effectiveVolumeGb?: number;
}) {
  const storedHourlyRateCents = toOptionalUnixMillis(run.computeHourlyRateCents);
  if (storedHourlyRateCents !== undefined && storedHourlyRateCents > 0) {
    return storedHourlyRateCents;
  }
  const computed = resolveRunComputePricing({
    gpuType: run.effectiveGpuType,
    gpuCount: run.effectiveGpuCount,
    volumeGb: run.effectiveVolumeGb,
  });
  if (computed.hourlyRateCents <= 0) {
    throw new Error("run hourly rate is invalid");
  }
  return Math.floor(computed.hourlyRateCents);
}

export async function settleRunComputeCharge(
  ctx: MutationCtx,
  run: Doc<"runs">,
  timing: { durationMs: number },
): Promise<ComputeSettlementResult> {
  const runId = String(run._id);
  const hourlyRateCents = resolveRunHourlyRateCents(run);
  const chargeCents = estimateRunUsageFromHourlyRateCents({
    hourlyRateCents,
    durationMs: timing.durationMs,
  });
  const collectedCents = Math.max(0, Math.floor(run.computeCollectedCents || 0));
  const chargeDeltaCents = chargeCents - collectedCents;

  if (chargeDeltaCents > 0) {
    const debited = await upsertLedgerDebitTotal(ctx, {
      userId: run.userId,
      targetDebitCents: chargeCents,
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_DEBIT,
      idempotencyKey: runLiveDebitIdempotencyKey(runId),
      referenceType: "run",
      referenceId: runId,
      metadata: {
        settlement: "runtime_terminal",
        charge_cents: chargeCents,
        duration_ms: timing.durationMs,
        gpu_type: run.effectiveGpuType,
        gpu_count: run.effectiveGpuCount,
        volume_gb: run.effectiveVolumeGb,
        hourly_rate_cents: hourlyRateCents,
      },
    });
    const nextCollectedCents = Math.min(chargeCents, debited.debitedCents);
    const outstandingCents = Math.max(0, chargeCents - nextCollectedCents);
    if (outstandingCents > 0) {
      await recordLedgerEvent(ctx, {
        userId: run.userId,
        eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_OWED,
        idempotencyKey: runSettlementIdempotencyKey(runId, "owed"),
        referenceType: "run",
        referenceId: runId,
        metadata: {
          settlement: "runtime_terminal",
          charge_cents: chargeCents,
          collected_cents: nextCollectedCents,
          outstanding_cents: outstandingCents,
          duration_ms: timing.durationMs,
          gpu_type: run.effectiveGpuType,
          gpu_count: run.effectiveGpuCount,
          volume_gb: run.effectiveVolumeGb,
          hourly_rate_cents: hourlyRateCents,
        },
      });
      return {
        chargeCents: chargeCents,
        chargeStatus: "owed",
        chargeError: "outstanding compute settlement",
        chargeDeltaCents,
        durationMs: timing.durationMs,
        hourlyRateCents,
        collectedCents: nextCollectedCents,
        outstandingCents,
      };
    }
    return {
      chargeCents: chargeCents,
      chargeStatus: outstandingCents > 0 ? "owed" : "charged",
      chargeDeltaCents,
      balanceAfterCents: debited.balanceCents,
      durationMs: timing.durationMs,
      hourlyRateCents,
      collectedCents: nextCollectedCents,
      outstandingCents,
    };
  }

  if (chargeDeltaCents < 0) {
    const refundCents = Math.abs(chargeDeltaCents);
    const refunded = await grantUserCredits(ctx, {
      userId: run.userId,
      amountCents: refundCents,
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_REFUND,
      idempotencyKey: runSettlementIdempotencyKey(runId, "refund"),
      referenceType: "run",
      referenceId: runId,
      metadata: {
        settlement: "runtime_terminal",
        charge_cents: chargeCents,
        duration_ms: timing.durationMs,
        gpu_type: run.effectiveGpuType,
        gpu_count: run.effectiveGpuCount,
        volume_gb: run.effectiveVolumeGb,
        hourly_rate_cents: hourlyRateCents,
      },
    });
    if (!refunded) {
      throw new Error("refund grant failed unexpectedly");
    }
    return {
      chargeCents: chargeCents,
      chargeStatus: "charged",
      chargeDeltaCents,
      balanceAfterCents: refunded.balanceCents,
      durationMs: timing.durationMs,
      hourlyRateCents,
      collectedCents: chargeCents,
      outstandingCents: 0,
    };
  }

  return {
    chargeCents: chargeCents,
    chargeStatus: "charged",
    chargeDeltaCents: 0,
    durationMs: timing.durationMs,
    hourlyRateCents,
    collectedCents: chargeCents,
    outstandingCents: 0,
  };
}
