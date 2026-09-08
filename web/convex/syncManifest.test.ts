import { describe, expect, it } from "vitest";

import { normalizeSha256, parseManifest, parseManifestEntry, sha256Hex } from "@convex/syncManifest";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("sync manifest parsing", () => {
  it("normalizes valid sha256 hashes and rejects malformed values", () => {
    expect(normalizeSha256(` ${HASH_A.toUpperCase()} `)).toBe(HASH_A);
    expect(normalizeSha256("abc")).toBeNull();
    expect(normalizeSha256(123)).toBeNull();
  });

  it("parses safe manifest entries", () => {
    expect(
      parseManifestEntry({
        path: " src/train.py ",
        sha256: HASH_A,
        size: 123,
        mode: 0o644,
      }),
    ).toEqual({
      path: "src/train.py",
      sha256: HASH_A,
      size: 123,
      mode: 0o644,
    });
  });

  it("rejects unsafe entry paths, invalid sizes, and invalid modes", () => {
    const unsafePaths = [
      "/absolute.py",
      "../escape.py",
      "nested/../escape.py",
      "windows\\path.py",
      `nul${String.fromCharCode(0)}byte.py`,
      ".",
      "..",
    ];

    for (const path of unsafePaths) {
      expect(parseManifestEntry({ path, sha256: HASH_A, size: 1, mode: 0o644 })).toBeNull();
    }
    expect(parseManifestEntry({ path: "ok.py", sha256: HASH_A, size: -1, mode: 0o644 })).toBeNull();
    expect(parseManifestEntry({ path: "ok.py", sha256: HASH_A, size: 1.5, mode: 0o644 })).toBeNull();
    expect(parseManifestEntry({ path: "ok.py", sha256: HASH_A, size: 1, mode: 0o1000 })).toBeNull();
  });

  it("parses sorted manifests for the requested kind", () => {
    expect(
      parseManifest(
        {
          version: 1,
          type: "code",
          created_at: 1234,
          entries: [
            { path: "a.py", sha256: HASH_A, size: 1, mode: 0o644 },
            { path: "b.py", sha256: HASH_B, size: 2, mode: 0o755 },
          ],
        },
        "code",
      ),
    ).toEqual({
      version: 1,
      type: "code",
      created_at: 1234,
      entries: [
        { path: "a.py", sha256: HASH_A, size: 1, mode: 0o644 },
        { path: "b.py", sha256: HASH_B, size: 2, mode: 0o755 },
      ],
    });
  });

  it("rejects manifests with wrong kind, unsorted entries, or oversized entries", () => {
    const entries = [
      { path: "b.py", sha256: HASH_B, size: 2, mode: 0o644 },
      { path: "a.py", sha256: HASH_A, size: 1, mode: 0o644 },
    ];

    expect(parseManifest({ version: 1, type: "data", created_at: 1, entries: [] }, "code")).toBeNull();
    expect(parseManifest({ version: 1, type: "code", created_at: 1, entries }, "code")).toBeNull();
    expect(
      parseManifest(
        {
          version: 1,
          type: "code",
          created_at: 1,
          entries: [{ path: "a.py", sha256: HASH_A, size: 10, mode: 0o644 }],
        },
        "code",
        { maxEntrySizeBytes: 9 },
      ),
    ).toBeNull();
  });

  it("computes sha256 hex digests for manifest bodies", async () => {
    await expect(sha256Hex("manifest")).resolves.toBe("05b3abf2579a5eb66403cd78be557fd860633a1fe2103c7642030defe32c657f");
  });
});
