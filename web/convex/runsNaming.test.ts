import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fallbackRunName,
  getRunName,
  hasRunNameConflict,
  normalizeRunName,
  pickUniqueGeneratedRunName,
  validateRunName,
} from "@convex/runsNaming";

describe("run naming helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes user-provided run names to canonical slugs", () => {
    expect(normalizeRunName("  My GPU_Run!!!  ")).toBe("my-gpu-run");
    expect(normalizeRunName("---Already---Slugged---")).toBe("already-slugged");
  });

  it("validates required and maximum run name constraints", () => {
    expect(validateRunName(" Research Trial ")).toBe("research-trial");
    expect(() => validateRunName("   ")).toThrow(new ConvexError("run name is required"));
    expect(() => validateRunName("a".repeat(65))).toThrow(
      new ConvexError("run name must be <= 64 characters"),
    );
  });

  it("falls back to run ids when stored rows have no canonical name", () => {
    expect(fallbackRunName("abc123456789" as never)).toBe("run-abc12345");
    expect(getRunName({ _id: "xyz987654321", name: "  " } as never)).toBe("run-xyz98765");
    expect(getRunName({ _id: "xyz987654321", name: " User Name " } as never)).toBe("user-name");
  });

  it("detects normalized conflicts while allowing the ignored current run", () => {
    const rows = [
      { _id: "run_1", name: "Trial One" },
      { _id: "run_2", name: "trial-two" },
    ] as never;

    expect(hasRunNameConflict(rows, "trial one")).toBe(true);
    expect(hasRunNameConflict(rows, "trial one", "run_1" as never)).toBe(false);
    expect(hasRunNameConflict(rows, "trial three")).toBe(false);
    expect(hasRunNameConflict(rows, "   ")).toBe(false);
  });

  it("generates a unique word name and suffixes after repeated conflicts", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(pickUniqueGeneratedRunName([])).toBe("amber-cloud-bear");
    expect(
      pickUniqueGeneratedRunName([
        { _id: "run_1", name: "amber-cloud-bear" },
      ] as never),
    ).toBe("amber-cloud-bear-2");
  });
});
