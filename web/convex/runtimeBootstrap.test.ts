import { beforeEach, describe, expect, it, vi } from "vitest";

const objectStoreMock = vi.hoisted(() => ({
  readBytes: vi.fn(),
  getSignedDownload: vi.fn(),
  getSignedDownloadWithMetadataSync: vi.fn(),
}));

vi.mock("@convex/objectStore", () => ({
  objectStore: objectStoreMock,
}));

import {
  fetchServeSnapshotManifest,
  fetchSyncManifest,
  resolveServeSnapshotDownloadEntries,
  resolveSyncManifestDownloadEntries,
  type ServeSnapshotManifest,
} from "@convex/runtimeBootstrap";
import { sha256Hex, type SyncManifestPayload } from "@convex/syncManifest";

function bytes(value: string) {
  return new TextEncoder().encode(value).buffer;
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("runtime bootstrap manifest helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and validates sync manifests by content hash and manifest kind", async () => {
    const manifest = JSON.stringify({
      version: 1,
      type: "code",
      created_at: 1234,
      entries: [
        { path: "train.py", sha256: HASH_A, size: 10, mode: 0o644 },
      ],
    });
    objectStoreMock.readBytes.mockResolvedValue(bytes(manifest));

    await expect(fetchSyncManifest({} as never, "code", "manifest-key", await sha256Hex(manifest))).resolves.toEqual({
      version: 1,
      type: "code",
      created_at: 1234,
      entries: [
        { path: "train.py", sha256: HASH_A, size: 10, mode: 0o644 },
      ],
    });
    expect(objectStoreMock.readBytes).toHaveBeenCalledWith({}, "manifest-key");
  });

  it("rejects sync manifests with hash mismatches, invalid JSON, or invalid payloads", async () => {
    objectStoreMock.readBytes.mockResolvedValueOnce(bytes("{}"));
    await expect(fetchSyncManifest({} as never, "code", "manifest-key", HASH_A)).rejects.toThrow(
      "code manifest hash mismatch",
    );

    objectStoreMock.readBytes.mockResolvedValueOnce(bytes("not json"));
    await expect(fetchSyncManifest({} as never, "code", "manifest-key", await sha256Hex("not json"))).rejects.toThrow(
      "code manifest is not valid JSON",
    );

    const invalidPayload = JSON.stringify({ version: 1, type: "data", created_at: 1, entries: [] });
    objectStoreMock.readBytes.mockResolvedValueOnce(bytes(invalidPayload));
    await expect(
      fetchSyncManifest({} as never, "code", "manifest-key", await sha256Hex(invalidPayload)),
    ).rejects.toThrow("code manifest payload is invalid");
  });

  it("resolves sync manifest entries through dedup blob keys and caches duplicate blob downloads", async () => {
    const manifest: SyncManifestPayload = {
      version: 1,
      type: "code",
      created_at: 1,
      entries: [
        { path: "a.py", sha256: HASH_A, size: 1, mode: 0o644 },
        { path: "b.py", sha256: HASH_A, size: 2, mode: 0o644 },
        { path: "c.py", sha256: HASH_B, size: 3, mode: 0o644 },
      ],
    };
    objectStoreMock.getSignedDownload
      .mockResolvedValueOnce({ key: `blobs/${HASH_A}`, url: "https://download/a" })
      .mockResolvedValueOnce(null);
    objectStoreMock.getSignedDownloadWithMetadataSync.mockResolvedValueOnce({
      key: `blobs/${HASH_B}`,
      url: "https://download/b",
    });

    await expect(resolveSyncManifestDownloadEntries({} as never, "code", manifest)).resolves.toEqual([
      { path: "a.py", sha256: HASH_A, size: 1, mode: 0o644, download_url: "https://download/a" },
      { path: "b.py", sha256: HASH_A, size: 2, mode: 0o644, download_url: "https://download/a" },
      { path: "c.py", sha256: HASH_B, size: 3, mode: 0o644, download_url: "https://download/b" },
    ]);
    expect(objectStoreMock.getSignedDownload).toHaveBeenCalledTimes(2);
    expect(objectStoreMock.getSignedDownloadWithMetadataSync).toHaveBeenCalledTimes(1);
  });

  it("fails sync bootstrap when a manifest blob cannot be downloaded", async () => {
    const manifest: SyncManifestPayload = {
      version: 1,
      type: "data",
      created_at: 1,
      entries: [{ path: "sample.txt", sha256: HASH_A, size: 1, mode: 0o644 }],
    };
    objectStoreMock.getSignedDownload.mockResolvedValue(null);
    objectStoreMock.getSignedDownloadWithMetadataSync.mockResolvedValue(null);

    await expect(resolveSyncManifestDownloadEntries({} as never, "data", manifest)).rejects.toThrow(
      `data blob is missing from object storage: ${HASH_A}`,
    );
  });

  it("fetches serve snapshot manifests and defaults missing file mode", async () => {
    const rawManifest = JSON.stringify({
      version: "serve-model-snapshot.v1",
      object_prefix: "serves/env_1/1234-fixed/model",
      entries: [
        {
          path: "model.bin",
          key: "serves/env_1/1234-fixed/model/model.bin",
          size: 10,
          sha256: HASH_A,
        },
      ],
    });
    objectStoreMock.readBytes.mockResolvedValue(bytes(rawManifest));

    await expect(
      fetchServeSnapshotManifest({} as never, "snapshot-key", await sha256Hex(rawManifest)),
    ).resolves.toEqual({
      version: "serve-model-snapshot.v1",
      object_prefix: "serves/env_1/1234-fixed/model",
      entries: [
        {
          path: "model.bin",
          key: "serves/env_1/1234-fixed/model/model.bin",
          size: 10,
          sha256: HASH_A,
          mode: 0o644,
        },
      ],
    });
  });

  it("rejects serve snapshot manifests whose entries escape the snapshot prefix", async () => {
    const rawManifest = JSON.stringify({
      version: "serve-model-snapshot.v1",
      object_prefix: "serves/env_1/1234-fixed/model",
      entries: [
        {
          path: "model.bin",
          key: "serves/env_1/other/model.bin",
          size: 10,
          sha256: HASH_A,
        },
      ],
    });
    objectStoreMock.readBytes.mockResolvedValue(bytes(rawManifest));

    await expect(
      fetchServeSnapshotManifest({} as never, "snapshot-key", await sha256Hex(rawManifest)),
    ).rejects.toThrow("serve snapshot manifest payload is invalid");
  });

  it("resolves serve snapshot object downloads through direct and metadata-synced URLs", async () => {
    const manifest: ServeSnapshotManifest = {
      version: "serve-model-snapshot.v1",
      object_prefix: "serves/env_1/1234-fixed/model",
      entries: [
        {
          path: "model.bin",
          key: "serves/env_1/1234-fixed/model/model.bin",
          size: 10,
          sha256: HASH_A,
          mode: 0o644,
        },
        {
          path: "tokenizer.json",
          key: "serves/env_1/1234-fixed/model/tokenizer.json",
          size: 20,
          sha256: "",
          mode: 0o644,
        },
      ],
    };
    objectStoreMock.getSignedDownload
      .mockResolvedValueOnce({ key: manifest.entries[0]?.key, url: "https://download/model" })
      .mockResolvedValueOnce(null);
    objectStoreMock.getSignedDownloadWithMetadataSync.mockResolvedValueOnce({
      key: manifest.entries[1]?.key,
      url: "https://download/tokenizer",
    });

    await expect(resolveServeSnapshotDownloadEntries({} as never, manifest)).resolves.toEqual([
      { path: "model.bin", sha256: HASH_A, size: 10, mode: 0o644, download_url: "https://download/model" },
      { path: "tokenizer.json", sha256: "", size: 20, mode: 0o644, download_url: "https://download/tokenizer" },
    ]);
  });
});
