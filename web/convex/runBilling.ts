import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { BILLING_CONFIG } from "@convex/appConfig";
import {
  consumeUserCredits,
  estimateRunUsageCents,
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
  const gpuCount = typeof run.effectiveGpuCount === "number" ? run.effectiveGpuCount : 0;
  const volumeGb = typeof run.effectiveVolumeGb === "number" ? run.effectiveVolumeGb : 0;
  const reservedCents = Math.max(0, Math.floor(run.creditsReservedCents || 0));
  const initialChargeCents =
    run.computeChargeStatus === "owed"
      ? Math.max(0, Math.floor(run.computeChargeCents || 0))
      : estimateRunUsageCents({
          gpuCount,
          volumeGb,
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
  const hourlyRateCents =
    gpuCount * BILLING_CONFIG.computeGpuHourlyRateCents +
    volumeGb * BILLING_CONFIG.computeVolumeGbHourlyRateCents;

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
        hourly_rate_cents: hourlyRateCents,
        outstanding_cents: initialOutstandingCents,
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
          hourly_rate_cents: hourlyRateCents,
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
        hourly_rate_cents: hourlyRateCents,
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
