import { beforeEach, describe, expect, it, vi } from "vitest";

const creditMocks = vi.hoisted(() => ({
  grantUserCredits: vi.fn(),
  recordLedgerEvent: vi.fn(),
  upsertLedgerDebitTotal: vi.fn(),
  USAGE_EVENT_TYPE: {
    RUN_COMPUTE_SETTLEMENT_DEBIT: "run_compute_settlement_debit",
    RUN_COMPUTE_SETTLEMENT_REFUND: "run_compute_settlement_refund",
    RUN_COMPUTE_SETTLEMENT_OWED: "run_compute_settlement_owed",
    TRAINING_COMPUTE_SETTLEMENT_DEBIT: "training_compute_settlement_debit",
    TRAINING_COMPUTE_SETTLEMENT_REFUND: "training_compute_settlement_refund",
    TRAINING_COMPUTE_SETTLEMENT_OWED: "training_compute_settlement_owed",
  },
}));

vi.mock("@convex/cloud/credits", () => creditMocks);

import {
  computeLiveDebitEventType,
  computeLiveDebitIdempotencyKey,
  computeSessionLiveDebitIdempotencyKey,
  estimateRunUsageFromHourlyRateCents,
  resolveComputeSubjectHourlyRateCents,
  runLiveDebitIdempotencyKey,
  serveLiveDebitIdempotencyKey,
  settleComputeCharge,
  toMinuteBucketUnixMs,
} from "@convex/cloud/runBilling";

describe("hosted compute billing helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds stable live debit idempotency keys and minute buckets", () => {
    expect(computeLiveDebitIdempotencyKey("run", "run_1")).toBe("run:run_1:live_debit");
    expect(runLiveDebitIdempotencyKey("run_1")).toBe("run:run_1:live_debit");
    expect(serveLiveDebitIdempotencyKey("serve_1")).toBe("serve:serve_1:live_debit");
    expect(computeSessionLiveDebitIdempotencyKey("session_1")).toBe("compute_session:session_1:live_debit");
    expect(computeLiveDebitEventType("run")).toBe("run_compute_settlement_debit");
    expect(computeLiveDebitEventType("serve")).toBe("run_compute_settlement_debit");
    expect(computeLiveDebitEventType("compute_session")).toBe("training_compute_settlement_debit");
    expect(toMinuteBucketUnixMs(119_999.9)).toBe(60_000);
    expect(toMinuteBucketUnixMs(-1)).toBe(0);
  });

  it("estimates usage from stored hourly rates with minimum charge behavior", () => {
    expect(estimateRunUsageFromHourlyRateCents({ hourlyRateCents: 120, durationMs: 60 * 60 * 1000 })).toBe(120);
    expect(estimateRunUsageFromHourlyRateCents({ hourlyRateCents: 120, durationMs: 1 })).toBe(1);
    expect(estimateRunUsageFromHourlyRateCents({ hourlyRateCents: 120, durationMs: 0 })).toBe(0);
    expect(estimateRunUsageFromHourlyRateCents({ hourlyRateCents: -120, durationMs: 60 * 60 * 1000 })).toBe(0);
  });

  it("prefers stored compute hourly rate over catalog pricing", () => {
    expect(
      resolveComputeSubjectHourlyRateCents({
        userId: "user_1",
        referenceType: "run",
        referenceId: "run_1",
        computeHourlyRateCents: 250.9,
      }),
    ).toBe(250.9);
  });

  it("settles additional compute debit as charged when ledger covers target charge", async () => {
    creditMocks.upsertLedgerDebitTotal.mockResolvedValue({
      balanceCents: 1_000,
      debitedCents: 60,
      appliedCents: 40,
    });

    await expect(
      settleComputeCharge(
        {} as never,
        {
          userId: "user_1",
          referenceType: "run",
          referenceId: "run_1",
          computeHourlyRateCents: 120,
          computeCollectedCents: 20,
        },
        { durationMs: 30 * 60 * 1000 },
      ),
    ).resolves.toEqual({
      chargeCents: 60,
      chargeStatus: "charged",
      chargeDeltaCents: 40,
      balanceAfterCents: 1_000,
      durationMs: 30 * 60 * 1000,
      hourlyRateCents: 120,
      collectedCents: 60,
      outstandingCents: 0,
    });
    expect(creditMocks.upsertLedgerDebitTotal).toHaveBeenCalledWith({}, expect.objectContaining({
      userId: "user_1",
      targetDebitCents: 60,
      idempotencyKey: "run:run_1:live_debit",
      referenceType: "run",
      referenceId: "run_1",
    }));
    expect(creditMocks.recordLedgerEvent).not.toHaveBeenCalled();
  });

  it("settles compute sessions against training compute ledger references", async () => {
    creditMocks.upsertLedgerDebitTotal.mockResolvedValue({
      balanceCents: 1_000,
      debitedCents: 60,
      appliedCents: 60,
    });

    await expect(
      settleComputeCharge(
        {} as never,
        {
          userId: "user_1",
          referenceType: "compute_session",
          referenceId: "session_1",
          computeHourlyRateCents: 120,
        },
        { durationMs: 30 * 60 * 1000 },
      ),
    ).resolves.toMatchObject({
      chargeCents: 60,
      chargeStatus: "charged",
      collectedCents: 60,
    });
    expect(creditMocks.upsertLedgerDebitTotal).toHaveBeenCalledWith({}, expect.objectContaining({
      eventType: "training_compute_settlement_debit",
      idempotencyKey: "compute_session:session_1:live_debit",
      referenceType: "compute_session",
      referenceId: "session_1",
    }));
  });

  it("records owed settlement when ledger cannot collect the full target charge", async () => {
    creditMocks.upsertLedgerDebitTotal.mockResolvedValue({
      balanceCents: 0,
      debitedCents: 30,
      appliedCents: 10,
    });
    creditMocks.recordLedgerEvent.mockResolvedValue(undefined);

    await expect(
      settleComputeCharge(
        {} as never,
        {
          userId: "user_1",
          referenceType: "serve",
          referenceId: "serve_1",
          computeHourlyRateCents: 120,
          computeCollectedCents: 20,
        },
        { durationMs: 30 * 60 * 1000 },
      ),
    ).resolves.toMatchObject({
      chargeCents: 60,
      chargeStatus: "owed",
      chargeError: "outstanding compute settlement",
      chargeDeltaCents: 40,
      collectedCents: 30,
      outstandingCents: 30,
    });
    expect(creditMocks.recordLedgerEvent).toHaveBeenCalledWith({}, expect.objectContaining({
      userId: "user_1",
      eventType: "run_compute_settlement_owed",
      idempotencyKey: "serve:serve_1:settlement:owed",
      referenceType: "serve",
      referenceId: "serve_1",
    }));
  });

  it("refunds over-collected terminal compute charge", async () => {
    creditMocks.grantUserCredits.mockResolvedValue({ balanceCents: 500 });

    await expect(
      settleComputeCharge(
        {} as never,
        {
          userId: "user_1",
          referenceType: "run",
          referenceId: "run_1",
          computeHourlyRateCents: 120,
          computeCollectedCents: 80,
        },
        { durationMs: 30 * 60 * 1000 },
      ),
    ).resolves.toEqual({
      chargeCents: 60,
      chargeStatus: "charged",
      chargeDeltaCents: -20,
      balanceAfterCents: 500,
      durationMs: 30 * 60 * 1000,
      hourlyRateCents: 120,
      collectedCents: 60,
      outstandingCents: 0,
    });
    expect(creditMocks.grantUserCredits).toHaveBeenCalledWith({}, expect.objectContaining({
      userId: "user_1",
      amountCents: 20,
      eventType: "run_compute_settlement_refund",
      idempotencyKey: "run:run_1:settlement:refund",
    }));
  });
});
