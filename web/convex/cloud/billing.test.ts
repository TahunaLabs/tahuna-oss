import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const creditMocks = vi.hoisted(() => ({
  ensureUserLedger: vi.fn(),
  grantUserCredits: vi.fn(),
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

vi.mock("@convex/auth", () => ({
  authComponent: {},
  requireUser: vi.fn(),
}));

vi.mock("@convex/cloud/credits", () => creditMocks);

import {
  BILLABLE_COMPUTE_SESSION_STATUSES,
  TRAINING_COMPUTE_BILLING_INTERVAL_MINUTES,
  applyTrainingComputeSessionLiveBillingResult,
  billLiveComputeSubject,
  initialHostedComputeSessionBillingFields,
  settleHostedComputeSessionUsage,
  validateHostedComputeSessionCreate,
} from "@convex/cloud/billing";

function fakeReservationCtx(
  rows: Array<{ userId: string; status: string; computeReservationRemainingCents?: number }>,
) {
  return {
    db: {
      query: (table: string) => {
        expect(table).toBe("computeSessions");
        return {
          withIndex: (_index: string, callback: (q: { eq: (_field: string, value: string) => unknown }) => unknown) => {
            let status = "";
            callback({
              eq: (_field: string, value: string) => {
                status = value;
                return {};
              },
            });
            return {
              collect: async () => rows.filter((row) => row.status === status),
            };
          },
        };
      },
    },
  };
}

describe("hosted billing session reservations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bills training compute sessions every five minutes", () => {
    expect(TRAINING_COMPUTE_BILLING_INTERVAL_MINUTES).toBe(5);
  });

  it("initializes compute sessions with a one-hour reservation hold", () => {
    expect(initialHostedComputeSessionBillingFields(120.1)).toMatchObject({
      computeHourlyRateCents: 120.1,
      computeReservationRequiredCents: 121,
      computeReservationRemainingCents: 121,
      computeChargeCents: 0,
      computeCollectedCents: 0,
      computeOutstandingCents: 0,
      computeChargeStatus: "pending",
    });
  });

  it("rejects compute-session launches when active reservations consume the ledger balance", async () => {
    creditMocks.ensureUserLedger.mockResolvedValue({
      balanceCents: 169,
      currency: "USD",
    });

    await expect(
      validateHostedComputeSessionCreate(
        fakeReservationCtx([
          {
            userId: "user_1",
            status: "running",
            computeReservationRemainingCents: 169,
          },
        ]) as never,
        {
          userId: "user_1",
          gpuType: "A100 PCIe",
          gpuCount: 1,
          volumeGb: 80,
        },
      ),
    ).rejects.toThrow("insufficient credits: add at least $1.69 before launching this run");
  });

  it("shrinks compute-session reservations as live billing collects usage", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_801_000);
    creditMocks.upsertLedgerDebitTotal.mockResolvedValue({
      balanceCents: 940,
      debitedCents: 60,
      appliedCents: 60,
    });

    await expect(
      billLiveComputeSubject({} as never, {
        subject: {
          userId: "user_1",
          referenceType: "compute_session",
          referenceId: "session_1",
          computeHourlyRateCents: 120,
          computeCollectedCents: 0,
        },
        startedAt: 1_000,
        previous: {
          computeChargeStatus: "pending",
          computeReservationRequiredCents: 120,
          computeReservationRemainingCents: 120,
        },
      }),
    ).resolves.toMatchObject({
      kind: "patched",
      charged: true,
      owed: false,
      patch: {
        computeChargeCents: 60,
        computeCollectedCents: 60,
        computeOutstandingCents: 0,
        computeChargeStatus: "charged",
        computeReservationRemainingCents: 60,
      },
    });
  });

  it("bills warm idle compute-session uptime against the session ledger reference", async () => {
    expect(BILLABLE_COMPUTE_SESSION_STATUSES).toContain("idle");
    vi.spyOn(Date, "now").mockReturnValue(601_000);
    creditMocks.upsertLedgerDebitTotal.mockResolvedValue({
      balanceCents: 980,
      debitedCents: 20,
      appliedCents: 20,
    });

    const result = await billLiveComputeSubject({} as never, {
      subject: {
        userId: "user_1",
        referenceType: "compute_session",
        referenceId: "session_1",
        computeHourlyRateCents: 120,
        computeCollectedCents: 0,
      },
      startedAt: 1_000,
      previous: {
        computeChargeStatus: "pending",
        computeReservationRequiredCents: 120,
        computeReservationRemainingCents: 120,
      },
    });

    expect(result).toMatchObject({
      kind: "patched",
      patch: {
        computeChargeCents: 20,
        computeCollectedCents: 20,
        computeReservationRemainingCents: 100,
      },
    });
    expect(creditMocks.upsertLedgerDebitTotal).toHaveBeenCalledWith({}, expect.objectContaining({
      idempotencyKey: "compute_session:session_1:live_debit",
      referenceType: "compute_session",
      referenceId: "session_1",
    }));
  });

  it("schedules insufficient-credit termination when live billing cannot collect the target", async () => {
    const ctx = {
      db: {
        patch: vi.fn(),
      },
      scheduler: {
        runAfter: vi.fn(),
      },
    };

    await applyTrainingComputeSessionLiveBillingResult(ctx as never, {
      _id: "session_1",
      userId: "user_1",
      environmentId: "env_1",
      activeRunId: "run_1",
    } as never, {
      kind: "patched",
      charged: true,
      owed: true,
      patch: {
        computeChargeCents: 60,
        computeCollectedCents: 20,
        computeOutstandingCents: 40,
        computeChargeStatus: "owed",
        computeChargeError: "insufficient credits",
        computeReservationRemainingCents: 100,
      },
    });

    expect(ctx.db.patch).toHaveBeenCalledWith("computeSessions", "session_1", expect.objectContaining({
      computeChargeStatus: "owed",
      computeOutstandingCents: 40,
    }));
    expect(ctx.scheduler.runAfter).toHaveBeenCalledWith(0, expect.anything(), {
      userId: "user_1",
      environmentId: "env_1",
      computeSessionId: "session_1",
      activeRunId: "run_1",
    });
  });

  it("releases unused compute-session reservations during terminal settlement", async () => {
    await expect(
      settleHostedComputeSessionUsage({} as never, {
        _id: "session_1",
        userId: "user_1",
        providerCreationTime: 1_000,
        computeStartedAt: 1_000,
        computeEndedAt: 481_000,
        computeHourlyRateCents: 120,
        computeReservationRequiredCents: 120,
        computeReservationRemainingCents: 104,
        computeCollectedCents: 16,
      } as never),
    ).resolves.toMatchObject({
      patch: {
        computeChargeCents: 16,
        computeCollectedCents: 16,
        computeReservationRemainingCents: 0,
        computeReservationReleasedAt: 481_000,
        computeChargeStatus: "charged",
      },
    });
    expect(creditMocks.grantUserCredits).not.toHaveBeenCalled();
  });

  it("does not move the reservation release timestamp when terminal settlement is retried", async () => {
    await expect(
      settleHostedComputeSessionUsage({} as never, {
        _id: "session_1",
        userId: "user_1",
        providerCreationTime: 1_000,
        computeStartedAt: 1_000,
        computeEndedAt: 481_000,
        computeHourlyRateCents: 120,
        computeReservationRequiredCents: 120,
        computeReservationRemainingCents: 0,
        computeReservationReleasedAt: 400_000,
        computeCollectedCents: 16,
      } as never),
    ).resolves.toMatchObject({
      patch: {
        computeReservationRemainingCents: 0,
        computeReservationReleasedAt: 400_000,
      },
    });
  });
});
