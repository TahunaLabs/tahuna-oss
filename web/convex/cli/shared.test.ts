import { describe, expect, it, vi } from "vitest";

vi.mock("@convex/cloud/errors", () => ({
  isHostedBillingClientError: (value: string) => /insufficient credits/i.test(value),
}));

import {
  extractBearerToken,
  parseSizeBytes,
  parseSyncKind,
  toClientErrorDetail,
} from "@convex/cli/shared";

describe("CLI HTTP shared helpers", () => {
  it("extracts bearer tokens case-insensitively and trims token text", () => {
    expect(
      extractBearerToken(
        new Request("https://example.test", {
          headers: { authorization: "  bEaReR   tk_123   " },
        }),
      ),
    ).toBe("tk_123");
    expect(extractBearerToken(new Request("https://example.test"))).toBe("");
    expect(
      extractBearerToken(
        new Request("https://example.test", {
          headers: { authorization: "Basic abc" },
        }),
      ),
    ).toBe("");
  });

  it("parses only canonical sync kinds", () => {
    expect(parseSyncKind("code")).toBe("code");
    expect(parseSyncKind("data")).toBe("data");
    expect(parseSyncKind("logs")).toBeNull();
    expect(parseSyncKind(null)).toBeNull();
  });

  it("accepts only positive integer byte sizes", () => {
    expect(parseSizeBytes(1)).toBe(1);
    expect(parseSizeBytes(1.5)).toBeNull();
    expect(parseSizeBytes(0)).toBeNull();
    expect(parseSizeBytes(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseSizeBytes("1")).toBeNull();
  });

  it("returns safe client errors and hides unexpected internals", () => {
    expect(toClientErrorDetail(new Error("authentication required"), "fallback")).toBe("authentication required");
    expect(toClientErrorDetail(new Error("Uncaught Error: run is active; cancel it before deleting"), "fallback")).toBe(
      "run is active; cancel it before deleting",
    );
    expect(toClientErrorDetail(new Error("insufficient credits for run"), "fallback")).toBe(
      "insufficient credits for run",
    );
    expect(toClientErrorDetail(new Error("database connection string leaked"), "fallback")).toBe("fallback");
    expect(toClientErrorDetail("plain string", "fallback")).toBe("fallback");
  });
});
