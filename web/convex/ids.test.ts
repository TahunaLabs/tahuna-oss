import { afterEach, describe, expect, it, vi } from "vitest";

import { shortId } from "@convex/ids";

describe("short ids", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generates base58 ids with optional prefixes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(shortId()).toBe("111111111111");
    expect(shortId("run")).toBe("run_111111111111");
  });

  it("does not emit ambiguous alphabet characters", () => {
    for (let index = 0; index < 100; index += 1) {
      expect(shortId("x")).toMatch(/^x_[1-9A-HJ-NP-Za-km-z]{12}$/);
    }
  });
});
