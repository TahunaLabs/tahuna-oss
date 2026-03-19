import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { estimateRunUsageCents, resolveRunComputePricing } from "@/lib/run-compute-pricing";
import {
  consumeUserCredits,
  grantUserCredits,
  recordLedgerEvent,
  USAGE_EVENT_TYPE,
} from "@convex/credits";

export function toUnixMillis(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

function toOptionalUnixMillis(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

export function resolveRunUptimeMs(
  run: {
    computeStartedAt?: number;
    computeEndedAt?: number;
    status?: string;
  },
  terminalStatuses: ReadonlySet<string>,
  nowMs = Date.now(),
) {
  const startedAt = toOptionalUnixMillis(run.computeStartedAt);
  if (startedAt === undefined) {
    return 0;
  }
  const endedAt = toOptionalUnixMillis(run.computeEndedAt);
  if (endedAt === undefined && run.status && terminalStatuses.has(run.status)) {
    return 0;
  }
  const resolvedEndedAt = endedAt ?? Math.max(startedAt, toUnixMillis(nowMs));
  return Math.max(0, resolvedEndedAt - startedAt);
}

export function resolveTerminalRunTiming(
  run: {
    computeStartedAt?: number;
    computeEndedAt?: number;
  },
  nowMs = Date.now(),
) {
  const startedAt = toOptionalUnixMillis(run.computeStartedAt);
  const existingEndedAt = toOptionalUnixMillis(run.computeEndedAt);
  if (startedAt === undefined) {
    return {
      computeEndedAt: existingEndedAt,
      durationMs: 0,
    };
  }
  const computeEndedAt = existingEndedAt ?? Math.max(startedAt, toUnixMillis(nowMs));
  return {
    computeEndedAt,
    durationMs: Math.max(0, computeEndedAt - startedAt),
  };
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

export async function settleRunComputeCharge(
  ctx: MutationCtx,
  run: Doc<"runs">,
  timing: { durationMs: number },
): Promise<ComputeSettlementResult> {
  if (run.computeChargeStatus === "charged") {
    return {
      chargeCents: Math.max(0, Math.floor(run.computeChargeCents || 0)),
      chargeStatus: "charged",
      chargeError: run.computeChargeError,
      chargeDeltaCents: 0,
      durationMs: timing.durationMs,
      hourlyRateCents: 0,
      collectedCents: Math.max(0, Math.floor(run.computeCollectedCents ?? run.computeChargeCents ?? 0)),
      outstandingCents: Math.max(0, Math.floor(run.computeOutstandingCents || 0)),
    };
  }

  const runId = String(run._id);
  const computePricing = resolveRunComputePricing({
    gpuType: run.effectiveGpuType,
    gpuCount: run.effectiveGpuCount,
    volumeGb: run.effectiveVolumeGb,
  });
  const reservedCents = Math.max(0, Math.floor(run.creditsReservedCents || 0));
  const initialChargeCents =
    run.computeChargeStatus === "owed"
      ? Math.max(0, Math.floor(run.computeChargeCents || 0))
      : estimateRunUsageCents({
          gpuType: run.effectiveGpuType,
          gpuCount: computePricing.gpuCount,
          volumeGb: computePricing.volumeGb,
          durationMs: timing.durationMs,
        });
  const initialCollectedCents =
    run.computeChargeStatus === "owed"
      ? Math.max(0, Math.floor(run.computeCollectedCents ?? reservedCents))
      : reservedCents;
  const initialOutstandingCents =
    run.computeChargeStatus === "owed"
      ? Math.max(0, Math.floor(run.computeOutstandingCents ?? initialChargeCents - initialCollectedCents))
      : Math.max(0, initialChargeCents - reservedCents);
  const chargeDeltaCents =
    run.computeChargeStatus === "owed"
      ? initialOutstandingCents
      : initialChargeCents - reservedCents;
  const hourlyRateCents = computePricing.hourlyRateCents;

  if (chargeDeltaCents > 0) {
    const consumed = await consumeUserCredits(ctx, {
      userId: run.userId,
      amountCents: chargeDeltaCents,
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_DEBIT,
      idempotencyKey: runSettlementIdempotencyKey(runId, "debit"),
      referenceType: "run",
      referenceId: runId,
      metadata: {
        settlement: "runtime_terminal",
        reserved_cents: reservedCents,
        charge_cents: initialChargeCents,
        duration_ms: timing.durationMs,
        gpu_type: run.effectiveGpuType,
        gpu_count: computePricing.gpuCount,
        volume_gb: computePricing.volumeGb,
        gpu_unit_hourly_rate_cents: computePricing.gpuUnitHourlyRateCents,
        gpu_hourly_rate_cents: computePricing.gpuHourlyRateCents,
        volume_hourly_rate_cents: computePricing.volumeHourlyRateCents,
        hourly_rate_cents: hourlyRateCents,
        outstanding_cents: initialOutstandingCents,
        used_fallback_gpu_rate: computePricing.usedFallbackGpuRate,
      },
    });
    if (!consumed) {
      await recordLedgerEvent(ctx, {
        userId: run.userId,
        eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_OWED,
        idempotencyKey: runSettlementIdempotencyKey(runId, "owed"),
        referenceType: "run",
        referenceId: runId,
        metadata: {
          settlement: "runtime_terminal",
          reserved_cents: reservedCents,
          charge_cents: initialChargeCents,
          collected_cents: initialCollectedCents,
          outstanding_cents: initialOutstandingCents,
          duration_ms: timing.durationMs,
          gpu_type: run.effectiveGpuType,
          gpu_count: computePricing.gpuCount,
          volume_gb: computePricing.volumeGb,
          gpu_unit_hourly_rate_cents: computePricing.gpuUnitHourlyRateCents,
          gpu_hourly_rate_cents: computePricing.gpuHourlyRateCents,
          volume_hourly_rate_cents: computePricing.volumeHourlyRateCents,
          hourly_rate_cents: hourlyRateCents,
          used_fallback_gpu_rate: computePricing.usedFallbackGpuRate,
        },
      });
      return {
        chargeCents: initialChargeCents,
        chargeStatus: "owed",
        chargeError: "outstanding compute settlement",
        chargeDeltaCents,
        durationMs: timing.durationMs,
        hourlyRateCents,
        collectedCents: initialCollectedCents,
        outstandingCents: initialOutstandingCents,
      };
    }
    return {
      chargeCents: initialChargeCents,
      chargeStatus: "charged",
      chargeDeltaCents,
      balanceAfterCents: consumed.balanceCents,
      durationMs: timing.durationMs,
      hourlyRateCents,
      collectedCents: initialChargeCents,
      outstandingCents: 0,
    };
  }

  if (chargeDeltaCents < 0) {
    const refunded = await grantUserCredits(ctx, {
      userId: run.userId,
      amountCents: Math.abs(chargeDeltaCents),
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_REFUND,
      idempotencyKey: runSettlementIdempotencyKey(runId, "refund"),
      referenceType: "run",
      referenceId: runId,
      metadata: {
        settlement: "runtime_terminal",
        reserved_cents: reservedCents,
        charge_cents: initialChargeCents,
        duration_ms: timing.durationMs,
        gpu_type: run.effectiveGpuType,
        gpu_count: computePricing.gpuCount,
        volume_gb: computePricing.volumeGb,
        gpu_unit_hourly_rate_cents: computePricing.gpuUnitHourlyRateCents,
        gpu_hourly_rate_cents: computePricing.gpuHourlyRateCents,
        volume_hourly_rate_cents: computePricing.volumeHourlyRateCents,
        hourly_rate_cents: hourlyRateCents,
        used_fallback_gpu_rate: computePricing.usedFallbackGpuRate,
      },
    });
    if (!refunded) {
      throw new Error("refund grant failed unexpectedly");
    }
    return {
      chargeCents: initialChargeCents,
      chargeStatus: "charged",
      chargeDeltaCents,
      balanceAfterCents: refunded.balanceCents,
      durationMs: timing.durationMs,
      hourlyRateCents,
      collectedCents: initialChargeCents,
      outstandingCents: 0,
    };
  }

  return {
    chargeCents: initialChargeCents,
    chargeStatus: "charged",
    chargeDeltaCents: 0,
    durationMs: timing.durationMs,
    hourlyRateCents,
    collectedCents: initialChargeCents,
    outstandingCents: 0,
  };
}
