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

    await expect(
      validateHostedServeCreate({} as never, {
        userId: "user_1",
        gpuType: "",
        gpuCount: 0,
        volumeGb: 730,
      }),
    ).rejects.toThrow(new ConvexError("insufficient credits: add at least $0.07 before launching this serve"));
    expect(creditMocks.ensureUserLedger).toHaveBeenCalledWith({}, {
      userId: "user_1",
      source: "serve_launch",
    });
  });
});
