import type { SyncKind } from "@convex/syncManifest";

export type ObjectStoreContext = unknown;

export type SignedUpload = {
  key: string;
  url: string;
};

export type SignedDownload = {
  key: string;
  url: string;
};

export type ObjectMetadata = {
  key: string;
  url?: string;
  size?: number;
  sha256?: string;
  _providerCreationTime?: string;
  contentType?: string;
};

export type ObjectMetadataPage = {
  page: ObjectMetadata[];
  isDone: boolean;
  continueCursor: string | null;
};

export type ObjectMetadataSyncOptions = {
  attempts?: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
};

export type ObjectStore = {
  createSignedUpload(key: string): Promise<SignedUpload>;
  createSignedDownload(key: string): Promise<SignedDownload>;
  getMetadata(ctx: ObjectStoreContext, key: string): Promise<ObjectMetadata | null>;
  getSignedDownload(ctx: ObjectStoreContext, key: string): Promise<SignedDownload | null>;
  getSignedDownloadWithMetadataSync(
    ctx: ObjectStoreContext,
    key: string,
    options?: ObjectMetadataSyncOptions,
  ): Promise<SignedDownload | null>;
  objectExists(ctx: ObjectStoreContext, key: string, options?: ObjectMetadataSyncOptions): Promise<boolean>;
  readBytes(ctx: ObjectStoreContext, key: string): Promise<ArrayBuffer>;
  listMetadata(ctx: ObjectStoreContext, limit?: number, cursor?: string | null): Promise<ObjectMetadataPage>;
  syncMetadata(ctx: ObjectStoreContext, key: string): Promise<void>;
  deleteObject(ctx: ObjectStoreContext, key: string): Promise<void>;
  copyObject(ctx: ObjectStoreContext, args: { fromKey: string; toKey: string }): Promise<void>;
  putTextObject(
    ctx: ObjectStoreContext,
    key: string,
    body: string,
    options?: { contentType?: string },
  ): Promise<void>;
  deleteAllObjects(ctx: ObjectStoreContext, dryRun: boolean): Promise<number>;
};

function encodeObjectPathSegment(value: string) {
  return encodeURIComponent(value.trim() || "file");
}

function blobObjectKey(sha256: string) {
  return `blobs/${sha256}`;
}

function dataObjectPrefix(dataId: string) {
  return `data/${dataId}/`;
}

function dataUploadRootPrefix() {
  return "data/";
}

function environmentObjectPrefix(environmentId: string) {
  return `environments/${environmentId}`;
}

function environmentObjectChildrenPrefix(environmentId: string) {
  return `${environmentObjectPrefix(environmentId)}/`;
}

function dataManifestPrefix(dataId: string) {
  return `${dataObjectPrefix(dataId)}manifests/`;
}

function dataManifestObjectKey(dataId: string, manifestHash: string) {
  return `${dataManifestPrefix(dataId)}${manifestHash}.json`;
}

function manifestPrefix(environmentId: string, dataId: string, kind: SyncKind) {
  if (kind === "data") {
    return dataManifestPrefix(dataId);
  }
  return `${environmentObjectPrefix(environmentId)}/manifests/${kind}/`;
}

function runObjectPrefix(environmentId: string) {
  return `runs/${environmentId}/`;
}

function runExecutionPrefix(environmentId: string, now: number) {
  return `${runObjectPrefix(environmentId)}${now}`;
}

function serveObjectPrefix(environmentId: string) {
  return `serves/${environmentId}/`;
}

function serveExecutionPrefix(environmentId: string, now: number) {
  return `${serveObjectPrefix(environmentId)}${now}`;
}

export const storageKeys = {
  blobObjectKey,
  dataUploadRootPrefix,
  dataObjectPrefix,
  dataUploadObjectKey(blobId: string, filename: string) {
    return `${dataUploadRootPrefix()}${blobId}__${encodeObjectPathSegment(filename)}`;
  },
  environmentObjectPrefix,
  environmentObjectChildrenPrefix,
  environmentManifestPrefix(environmentId: string) {
    return `${environmentObjectPrefix(environmentId)}/manifests/code/`;
  },
  dataManifestPrefix,
  dataManifestObjectKey,
  manifestPrefix,
  manifestObjectKey(environmentId: string, dataId: string, kind: SyncKind, manifestHash: string) {
    return `${manifestPrefix(environmentId, dataId, kind)}${manifestHash}.json`;
  },
  runObjectPrefix,
  runExecutionPrefix,
  serveObjectPrefix,
  serveExecutionPrefix,
  serveSnapshotBasePrefix(environmentId: string, now: number = Date.now(), suffix?: string) {
    const resolvedSuffix = suffix || Math.random().toString(36).slice(2, 8);
    return `${serveObjectPrefix(environmentId)}${now}-${resolvedSuffix}`;
  },
  serveSnapshotModelPrefix(snapshotBasePrefix: string) {
    return `${snapshotBasePrefix}/model`;
  },
  serveSnapshotManifestKey(snapshotBasePrefix: string) {
    return `${snapshotBasePrefix}/model-manifest.json`;
  },
};

export function storagePrefixUpperBound(prefix: string) {
  return `${prefix}\uffff`;
}
