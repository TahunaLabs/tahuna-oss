import { describe, expect, it } from "vitest";

import { storageKeys, storagePrefixUpperBound } from "@convex/core/storage";

describe("storage key helpers", () => {
  it("builds canonical blob, data, environment, run, and serve prefixes", () => {
    expect(storageKeys.blobObjectKey("abc123")).toBe("blobs/abc123");
    expect(storageKeys.dataObjectPrefix("data_1")).toBe("data/data_1/");
    expect(storageKeys.environmentObjectPrefix("env_1")).toBe("environments/env_1");
    expect(storageKeys.environmentObjectChildrenPrefix("env_1")).toBe("environments/env_1/");
    expect(storageKeys.runExecutionPrefix("env_1", 1234)).toBe("runs/env_1/1234");
    expect(storageKeys.serveExecutionPrefix("env_1", 5678)).toBe("serves/env_1/5678");
  });

  it("encodes direct upload filenames as a single object path segment", () => {
    expect(storageKeys.dataUploadObjectKey("blob_1", "weights/model.bin")).toBe("data/blob_1__weights%2Fmodel.bin");
    expect(storageKeys.dataUploadObjectKey("blob_1", "  ")).toBe("data/blob_1__file");
  });

  it("routes data manifests under data ids and code manifests under environments", () => {
    expect(storageKeys.manifestPrefix("env_1", "data_1", "code")).toBe("environments/env_1/manifests/code/");
    expect(storageKeys.manifestPrefix("env_1", "data_1", "data")).toBe("data/data_1/manifests/");
    expect(storageKeys.manifestObjectKey("env_1", "data_1", "code", "hash_1")).toBe(
      "environments/env_1/manifests/code/hash_1.json",
    );
    expect(storageKeys.manifestObjectKey("env_1", "data_1", "data", "hash_1")).toBe(
      "data/data_1/manifests/hash_1.json",
    );
  });

  it("builds serve snapshot keys with explicit timestamp and suffix", () => {
    const basePrefix = storageKeys.serveSnapshotBasePrefix("env_1", 1234, "fixed");

    expect(basePrefix).toBe("serves/env_1/1234-fixed");
    expect(storageKeys.serveSnapshotModelPrefix(basePrefix)).toBe("serves/env_1/1234-fixed/model");
    expect(storageKeys.serveSnapshotManifestKey(basePrefix)).toBe("serves/env_1/1234-fixed/model-manifest.json");
  });

  it("builds lexicographic upper bounds for prefix scans", () => {
    expect(storagePrefixUpperBound("runs/env_1/")).toBe("runs/env_1/\uffff");
  });
});
