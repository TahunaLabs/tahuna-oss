import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";

const creditMocks = vi.hoisted(() => ({
  ensureUserLedger: vi.fn(),
}));

vi.mock("@convex/cloud/credits", () => ({
  ensureUserLedger: creditMocks.ensureUserLedger,
}));

import {
  initialHostedServeBillingFields,
  validateHostedServeCreate,
} from "@convex/cloud/serveBilling";

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

describe("hosted serve billing helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes hosted serve billing fields from compute pricing", () => {
    expect(
      initialHostedServeBillingFields({
        gpuType: "",
        gpuCount: 0,
        volumeGb: 730,
      }),
    ).toEqual({
      computeHourlyRateCents: 12,
      creditsReservedCents: 0,
      computeChargeCents: 0,
      computeCollectedCents: 0,
      computeOutstandingCents: 0,
      computeChargeStatus: "pending",
    });
  });

  it("skips ledger checks when launch estimate has no charge", async () => {
    await expect(
      validateHostedServeCreate({} as never, {
        userId: "user_1",
        gpuType: "",
        gpuCount: 0,
        volumeGb: 0,
      }),
    ).resolves.toBeUndefined();
    expect(creditMocks.ensureUserLedger).not.toHaveBeenCalled();
  });

  it("rejects serve launch when hosted credits cannot cover launch estimate", async () => {
    creditMocks.ensureUserLedger.mockResolvedValue({ balanceCents: 5 });
    const ctx = fakeReservationCtx([]);

    await expect(
      validateHostedServeCreate(ctx as never, {
        userId: "user_1",
        gpuType: "",
        gpuCount: 0,
        volumeGb: 730,
      }),
    ).rejects.toThrow(new ConvexError("insufficient credits: add at least $0.07 before launching this serve"));
    expect(creditMocks.ensureUserLedger).toHaveBeenCalledWith(ctx, {
      userId: "user_1",
      source: "compute_session_launch",
    });
  });

  it("rejects serve launch when active compute-session reservations consume available credits", async () => {
    creditMocks.ensureUserLedger.mockResolvedValue({ balanceCents: 12 });

    await expect(
      validateHostedServeCreate(
        fakeReservationCtx([
          {
            userId: "user_1",
            status: "running",
            computeReservationRemainingCents: 12,
          },
        ]) as never,
        {
          userId: "user_1",
          gpuType: "",
          gpuCount: 0,
          volumeGb: 730,
        },
      ),
    ).rejects.toThrow(new ConvexError("insufficient credits: add at least $0.12 before launching this serve"));
  });
});
