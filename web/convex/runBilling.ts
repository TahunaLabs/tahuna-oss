import type { Doc } from "@convex/_generated/dataModel";
import type { MutationCtx } from "@convex/_generated/server";
import { BILLING_CONFIG } from "@convex/appConfig";
import {
  consumeUserCredits,
  estimateRunUsageCents,
  grantUserCredits,
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
  chargeStatus: "charged" | "failed";
  chargeError?: string;
  chargeDeltaCents: number;
  balanceAfterCents?: number;
  durationMs: number;
  hourlyRateCents: number;
};

export async function settleRunComputeCharge(
  ctx: MutationCtx,
  run: Doc<"runs">,
  timing: { durationMs: number },
): Promise<ComputeSettlementResult> {
  if (run.computeChargeStatus !== "pending") {
    return {
      chargeCents: Math.max(0, Math.floor(run.computeChargeCents || 0)),
      chargeStatus: run.computeChargeStatus === "failed" ? "failed" : "charged",
      chargeError: run.computeChargeError,
      chargeDeltaCents: 0,
      durationMs: timing.durationMs,
      hourlyRateCents: 0,
    };
  }

  const gpuCount = typeof run.effectiveGpuCount === "number" ? run.effectiveGpuCount : 0;
  const volumeGb = typeof run.effectiveVolumeGb === "number" ? run.effectiveVolumeGb : 0;
  const reservedCents = Math.max(0, Math.floor(run.creditsReservedCents || 0));
  const chargeCents = estimateRunUsageCents({
    gpuCount,
    volumeGb,
    durationMs: timing.durationMs,
  });
  const chargeDeltaCents = chargeCents - reservedCents;
  const hourlyRateCents =
    gpuCount * BILLING_CONFIG.computeGpuHourlyRateCents +
    volumeGb * BILLING_CONFIG.computeVolumeGbHourlyRateCents;

  if (chargeDeltaCents > 0) {
    const consumed = await consumeUserCredits(ctx, {
      userId: run.userId,
      amountCents: chargeDeltaCents,
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_DEBIT,
      referenceType: "run",
      referenceId: String(run._id),
      metadata: {
        settlement: "runtime_terminal",
        reserved_cents: reservedCents,
        charge_cents: chargeCents,
        duration_ms: timing.durationMs,
        hourly_rate_cents: hourlyRateCents,
      },
    });
    if (!consumed) {
      return {
        chargeCents,
        chargeStatus: "failed",
        chargeError: "insufficient credits for compute settlement",
        chargeDeltaCents,
        durationMs: timing.durationMs,
        hourlyRateCents,
      };
    }
    return {
      chargeCents,
      chargeStatus: "charged",
      chargeDeltaCents,
      balanceAfterCents: consumed.balanceCents,
      durationMs: timing.durationMs,
      hourlyRateCents,
    };
  }

  if (chargeDeltaCents < 0) {
    const refunded = await grantUserCredits(ctx, {
      userId: run.userId,
      amountCents: Math.abs(chargeDeltaCents),
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_REFUND,
      referenceType: "run",
      referenceId: String(run._id),
      metadata: {
        settlement: "runtime_terminal",
        reserved_cents: reservedCents,
        charge_cents: chargeCents,
        duration_ms: timing.durationMs,
        hourly_rate_cents: hourlyRateCents,
      },
    });
    return {
      chargeCents,
      chargeStatus: "charged",
      chargeDeltaCents,
      balanceAfterCents: refunded.balanceCents,
      durationMs: timing.durationMs,
      hourlyRateCents,
    };
  }

  return {
    chargeCents,
    chargeStatus: "charged",
    chargeDeltaCents: 0,
    durationMs: timing.durationMs,
    hourlyRateCents,
  };
}
