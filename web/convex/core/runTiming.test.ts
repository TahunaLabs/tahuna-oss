import { describe, expect, it } from "vitest";

import {
  resolveRunUptimeMs,
  resolveTerminalRunTiming,
  toUnixMillis,
} from "@convex/core/runTiming";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

describe("run timing helpers", () => {
  it("normalizes unix millisecond values", () => {
    expect(toUnixMillis(Number.NaN)).toBe(0);
    expect(toUnixMillis(-10)).toBe(0);
    expect(toUnixMillis(1234.9)).toBe(1234);
  });

  it("reports zero uptime until compute has started", () => {
    expect(resolveRunUptimeMs({}, TERMINAL_STATUSES, 10_000)).toBe(0);
    expect(resolveRunUptimeMs({ computeStartedAt: Number.NaN }, TERMINAL_STATUSES, 10_000)).toBe(0);
  });

  it("uses compute end time when present", () => {
    expect(
      resolveRunUptimeMs(
        { computeStartedAt: 1_000.9, computeEndedAt: 5_000.9, status: "running" },
        TERMINAL_STATUSES,
        10_000,
      ),
    ).toBe(4_000);
  });

  it("uses now for active runs without an end time and clamps backwards clocks", () => {
    expect(resolveRunUptimeMs({ computeStartedAt: 1_000, status: "running" }, TERMINAL_STATUSES, 5_000)).toBe(4_000);
    expect(resolveRunUptimeMs({ computeStartedAt: 5_000, status: "running" }, TERMINAL_STATUSES, 1_000)).toBe(0);
  });

  it("does not accrue uptime for terminal runs missing an end time", () => {
    expect(resolveRunUptimeMs({ computeStartedAt: 1_000, status: "completed" }, TERMINAL_STATUSES, 5_000)).toBe(0);
  });

  it("resolves terminal timing from provider creation before compute start", () => {
    expect(
      resolveTerminalRunTiming(
        {
          providerCreationTime: 1_000,
          computeStartedAt: 2_000,
        },
        5_000,
      ),
    ).toEqual({
      computeEndedAt: 5_000,
      durationMs: 4_000,
    });
  });

  it("preserves existing terminal end time and handles missing starts", () => {
    expect(resolveTerminalRunTiming({ computeStartedAt: 2_000, computeEndedAt: 4_000 }, 8_000)).toEqual({
      computeEndedAt: 4_000,
      durationMs: 2_000,
    });
    expect(resolveTerminalRunTiming({ computeEndedAt: 4_000 }, 8_000)).toEqual({
      computeEndedAt: 4_000,
      durationMs: 0,
    });
  });
});
