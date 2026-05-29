import { describe, expect, it, vi } from "vitest";

import { generateApiKeyPlaintext } from "@convex/secretTokens";

describe("secret token generation", () => {
  it("generates tahuna API keys from 32 random bytes", () => {
    const randomSpy = vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      const bytes = array as Uint8Array;
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index;
      }
      return array;
    });

    expect(generateApiKeyPlaintext()).toBe(
      "tk_000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );
    expect(randomSpy).toHaveBeenCalledWith(expect.objectContaining({ length: 32 }));
  });
});
