import { describe, expect, it, vi } from "vitest";

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
  initialHostedComputeSessionBillingFields,
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
});
