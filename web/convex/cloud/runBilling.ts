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

function toOptionalPositiveNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, value);
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

export type ComputeBillingSubject = {
  userId: string;
  referenceType: "run" | "serve";
  referenceId: string;
  gpuType?: string;
  gpuCount?: number;
  volumeGb?: number;
  computeHourlyRateCents?: number;
  computeCollectedCents?: number;
};

function computeSettlementIdempotencyKey(referenceType: string, referenceId: string, kind: "debit" | "refund" | "owed") {
  return `${referenceType}:${referenceId}:settlement:${kind}`;
}

export function computeLiveDebitIdempotencyKey(referenceType: string, referenceId: string) {
  return `${referenceType}:${referenceId}:live_debit`;
}

export function runLiveDebitIdempotencyKey(runId: string) {
  return computeLiveDebitIdempotencyKey("run", runId);
}

export function serveLiveDebitIdempotencyKey(serveId: string) {
  return computeLiveDebitIdempotencyKey("serve", serveId);
}

export function toMinuteBucketUnixMs(value: number) {
  return Math.floor(toCoreUnixMillis(value) / MS_PER_MINUTE) * MS_PER_MINUTE;
}

export function estimateRunUsageFromHourlyRateCents(args: {
  hourlyRateCents: number;
  durationMs: number | undefined;
}) {
  const hourlyRateCents = Math.max(0, args.hourlyRateCents);
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
  const storedHourlyRateCents = toOptionalPositiveNumber(run.computeHourlyRateCents);
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
  return computed.hourlyRateCents;
}

export function resolveComputeSubjectHourlyRateCents(subject: ComputeBillingSubject) {
  const storedHourlyRateCents = toOptionalPositiveNumber(subject.computeHourlyRateCents);
  if (storedHourlyRateCents !== undefined && storedHourlyRateCents > 0) {
    return storedHourlyRateCents;
  }
  const computed = resolveRunComputePricing({
    gpuType: subject.gpuType,
    gpuCount: subject.gpuCount,
    volumeGb: subject.volumeGb,
  });
  if (computed.hourlyRateCents <= 0) {
    throw new Error(`${subject.referenceType} hourly rate is invalid`);
  }
  return computed.hourlyRateCents;
}

export async function settleComputeCharge(
  ctx: MutationCtx,
  subject: ComputeBillingSubject,
  timing: { durationMs: number },
): Promise<ComputeSettlementResult> {
  const hourlyRateCents = resolveComputeSubjectHourlyRateCents(subject);
  const chargeCents = estimateRunUsageFromHourlyRateCents({
    hourlyRateCents,
    durationMs: timing.durationMs,
  });
  const collectedCents = Math.max(0, Math.floor(subject.computeCollectedCents || 0));
  const chargeDeltaCents = chargeCents - collectedCents;

  if (chargeDeltaCents > 0) {
    const debited = await upsertLedgerDebitTotal(ctx, {
      userId: subject.userId,
      targetDebitCents: chargeCents,
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_DEBIT,
      idempotencyKey: computeLiveDebitIdempotencyKey(subject.referenceType, subject.referenceId),
      referenceType: subject.referenceType,
      referenceId: subject.referenceId,
      metadata: {
        settlement: "runtime_terminal",
        charge_cents: chargeCents,
        duration_ms: timing.durationMs,
        gpu_type: subject.gpuType,
        gpu_count: subject.gpuCount,
        volume_gb: subject.volumeGb,
        hourly_rate_cents: hourlyRateCents,
      },
    });
    const nextCollectedCents = Math.min(chargeCents, debited.debitedCents);
    const outstandingCents = Math.max(0, chargeCents - nextCollectedCents);
    if (outstandingCents > 0) {
      await recordLedgerEvent(ctx, {
        userId: subject.userId,
        eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_OWED,
        idempotencyKey: computeSettlementIdempotencyKey(subject.referenceType, subject.referenceId, "owed"),
        referenceType: subject.referenceType,
        referenceId: subject.referenceId,
        metadata: {
          settlement: "runtime_terminal",
          charge_cents: chargeCents,
          collected_cents: nextCollectedCents,
          outstanding_cents: outstandingCents,
          duration_ms: timing.durationMs,
          gpu_type: subject.gpuType,
          gpu_count: subject.gpuCount,
          volume_gb: subject.volumeGb,
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
      userId: subject.userId,
      amountCents: refundCents,
      eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_REFUND,
      idempotencyKey: computeSettlementIdempotencyKey(subject.referenceType, subject.referenceId, "refund"),
      referenceType: subject.referenceType,
      referenceId: subject.referenceId,
      metadata: {
        settlement: "runtime_terminal",
        charge_cents: chargeCents,
        duration_ms: timing.durationMs,
        gpu_type: subject.gpuType,
        gpu_count: subject.gpuCount,
        volume_gb: subject.volumeGb,
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

export async function settleRunComputeCharge(
  ctx: MutationCtx,
  run: Doc<"runs">,
  timing: { durationMs: number },
): Promise<ComputeSettlementResult> {
  return settleComputeCharge(ctx, {
    userId: run.userId,
    referenceType: "run",
    referenceId: String(run._id),
    gpuType: run.effectiveGpuType,
    gpuCount: run.effectiveGpuCount,
    volumeGb: run.effectiveVolumeGb,
    computeHourlyRateCents: run.computeHourlyRateCents,
    computeCollectedCents: run.computeCollectedCents,
  }, timing);
}

export async function settleServeComputeCharge(
  ctx: MutationCtx,
  serve: Doc<"serves">,
  timing: { durationMs: number },
): Promise<ComputeSettlementResult> {
  return settleComputeCharge(ctx, {
    userId: serve.userId,
    referenceType: "serve",
    referenceId: String(serve._id),
    gpuType: serve.gpuType,
    gpuCount: serve.gpuCount,
    volumeGb: serve.volumeGb,
    computeHourlyRateCents: serve.computeHourlyRateCents,
    computeCollectedCents: serve.computeCollectedCents,
  }, timing);
}
