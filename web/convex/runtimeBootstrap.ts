import type { ActionCtx } from "@convex/_generated/server"
import { storageKeys } from "@convex/core/storage"
import { objectStore } from "@convex/objectStore"
import {
  parseManifest,
  sha256Hex,
  type ManifestEntry,
  type SyncKind,
  type SyncManifestPayload,
} from "@convex/syncManifest"

const SERVE_SNAPSHOT_MANIFEST_VERSION = "serve-model-snapshot.v1"
const defaultServeSnapshotFileMode = 0o644

export type RuntimeBootstrapEntry = ManifestEntry & {
  download_url: string;
}

export type ServeSnapshotManifestEntry = {
  path: string;
  key: string;
  size: number;
  sha256: string;
  mode: number;
}

export type ServeSnapshotManifest = {
  version: typeof SERVE_SNAPSHOT_MANIFEST_VERSION;
  object_prefix: string;
  entries: ServeSnapshotManifestEntry[];
}

export async function fetchSyncManifest(
  ctx: ActionCtx,
  kind: SyncKind,
  key: string,
  expectedHash: string,
) {
  const rawBytes = await objectStore.readBytes(ctx, key)
  const rawText = new TextDecoder().decode(rawBytes)
  const actualHash = await sha256Hex(rawText)
  if (actualHash !== expectedHash) {
    throw new Error(`${kind} manifest hash mismatch`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error(`${kind} manifest is not valid JSON`)
  }
  const manifest = parseManifest(parsed, kind)
  if (!manifest) {
    throw new Error(`${kind} manifest payload is invalid`)
  }
  return manifest
}

async function resolveDownloadURL(ctx: ActionCtx, key: string, keyURLCache: Map<string, string | null>) {
  if (keyURLCache.has(key)) {
    return keyURLCache.get(key) || null
  }

  let downloadURL = (await objectStore.getSignedDownload(ctx, key))?.url || null
  keyURLCache.set(key, downloadURL)
  if (downloadURL) {
    return downloadURL
  }

  downloadURL = (await objectStore.getSignedDownloadWithMetadataSync(ctx, key))?.url || null
  keyURLCache.set(key, downloadURL)
  return downloadURL
}

function blobKeys(_kind: SyncKind, sha256: string) {
  return [storageKeys.blobObjectKey(sha256)]
}

export async function resolveSyncManifestDownloadEntries(
  ctx: ActionCtx,
  kind: SyncKind,
  manifest: SyncManifestPayload,
): Promise<RuntimeBootstrapEntry[]> {
  const entries: RuntimeBootstrapEntry[] = []
  const keyURLCache = new Map<string, string | null>()
  for (const entry of manifest.entries) {
    let downloadURL: string | null = null
    for (const key of blobKeys(kind, entry.sha256)) {
      downloadURL = await resolveDownloadURL(ctx, key, keyURLCache)
      if (downloadURL) {
        break
      }
    }
    if (!downloadURL) {
      throw new Error(`${kind} blob is missing from object storage: ${entry.sha256}`)
    }
    entries.push({
      ...entry,
      download_url: downloadURL,
    })
  }
  return entries
}

function parseServeSnapshotManifest(raw: unknown): ServeSnapshotManifest | null {
  if (!raw || typeof raw !== "object") {
    return null
  }
  const row = raw as {
    version?: unknown;
    object_prefix?: unknown;
    entries?: unknown;
  }
  if (row.version !== SERVE_SNAPSHOT_MANIFEST_VERSION || typeof row.object_prefix !== "string" || !row.object_prefix.trim()) {
    return null
  }
  if (!Array.isArray(row.entries)) {
    return null
  }

  const entries: ServeSnapshotManifestEntry[] = []
  for (const rawEntry of row.entries) {
    if (!rawEntry || typeof rawEntry !== "object") {
      return null
    }
    const entry = rawEntry as {
      path?: unknown;
      key?: unknown;
      size?: unknown;
      sha256?: unknown;
      mode?: unknown;
    }
    if (typeof entry.path !== "string" || !entry.path.trim()) {
      return null
    }
    if (typeof entry.key !== "string" || !entry.key.trim()) {
      return null
    }
    if (!entry.key.startsWith(`${row.object_prefix}/`) && entry.key !== row.object_prefix) {
      return null
    }
    if (typeof entry.size !== "number" || !Number.isFinite(entry.size) || entry.size < 0) {
      return null
    }
    if (
      typeof entry.sha256 !== "string" ||
      (entry.sha256 !== "" && !/^[a-f0-9]{64}$/.test(entry.sha256))
    ) {
      return null
    }

    let mode = defaultServeSnapshotFileMode
    if (typeof entry.mode === "number" && Number.isFinite(entry.mode) && entry.mode > 0) {
      mode = Math.floor(entry.mode)
    }

    entries.push({
      path: entry.path,
      key: entry.key,
      size: entry.size,
      sha256: entry.sha256,
      mode,
    })
  }

  return {
    version: SERVE_SNAPSHOT_MANIFEST_VERSION,
    object_prefix: row.object_prefix,
    entries,
  }
}

export async function fetchServeSnapshotManifest(
  ctx: ActionCtx,
  key: string,
  expectedHash: string,
): Promise<ServeSnapshotManifest> {
  const rawBytes = await objectStore.readBytes(ctx, key)
  const rawText = new TextDecoder().decode(rawBytes)
  const actualHash = await sha256Hex(rawText)
  if (actualHash !== expectedHash) {
    throw new Error("serve snapshot manifest hash mismatch")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new Error("serve snapshot manifest is not valid JSON")
  }
  const manifest = parseServeSnapshotManifest(parsed)
  if (!manifest) {
    throw new Error("serve snapshot manifest payload is invalid")
  }
  return manifest
}

export async function resolveServeSnapshotDownloadEntries(
  ctx: ActionCtx,
  manifest: ServeSnapshotManifest,
): Promise<RuntimeBootstrapEntry[]> {
  const entries: RuntimeBootstrapEntry[] = []
  const keyURLCache = new Map<string, string | null>()
  for (const entry of manifest.entries) {
    const downloadURL = await resolveDownloadURL(ctx, entry.key, keyURLCache)
    if (!downloadURL) {
      throw new Error(`serve snapshot object is missing from object storage: ${entry.key}`)
    }
    entries.push({
      path: entry.path,
      sha256: entry.sha256,
      size: entry.size,
      mode: entry.mode,
      download_url: downloadURL,
    })
  }
  return entries
}
