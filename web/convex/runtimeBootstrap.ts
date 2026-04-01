import { components } from "@convex/_generated/api"
import type { ActionCtx } from "@convex/_generated/server"
import { R2 } from "@convex-dev/r2"
import { HeadObjectCommand } from "@aws-sdk/client-s3"
import { SYNC_CONFIG } from "@convex/appConfig"
import { sleepMs } from "@convex/sleep"
import {
  parseManifest,
  sha256Hex,
  type ManifestEntry,
  type SyncKind,
  type SyncManifestPayload,
} from "@convex/syncManifest"

const r2 = new R2(components.r2)

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

async function fetchObjectBytes(_ctx: ActionCtx, key: string): Promise<ArrayBuffer> {
  const downloadUrl = await r2.getUrl(key)
  const response = await fetch(downloadUrl)
  if (response.status === 404) {
    throw new Error(`object not found: ${key}`)
  }
  if (!response.ok) {
    throw new Error(`failed to fetch object ${key}: http ${response.status}`)
  }
  return await response.arrayBuffer()
}

export async function fetchSyncManifest(
  ctx: ActionCtx,
  kind: SyncKind,
  key: string,
  expectedHash: string,
) {
  const rawBytes = await fetchObjectBytes(ctx, key)
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

function isS3NotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false
  }
  const row = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }
  return row.name === "NotFound" || row.Code === "NotFound" || row.$metadata?.httpStatusCode === 404
}

async function getSignedDownloadUrlByHead(key: string): Promise<string | null> {
  try {
    await r2.client.send(
      new HeadObjectCommand({
        Bucket: r2.config.bucket,
        Key: key,
      }),
    )
    return r2.getUrl(key)
  } catch (error) {
    if (isS3NotFoundError(error)) {
      return null
    }
    throw error
  }
}

async function getDownloadUrlWithMetadataSync(ctx: ActionCtx, key: string): Promise<string | null> {
  const immediate = await r2.getMetadata(ctx, key)
  if (immediate?.url) {
    return immediate.url
  }
  const direct = await getSignedDownloadUrlByHead(key)
  if (direct) {
    return direct
  }
  let delay = SYNC_CONFIG.objectMetadataPollInitialBackoffMs
  for (let attempt = 0; attempt < SYNC_CONFIG.objectMetadataPollAttempts; attempt += 1) {
    const metadata = await r2.getMetadata(ctx, key)
    if (metadata?.url) {
      return metadata.url
    }
    const signedUrl = await getSignedDownloadUrlByHead(key)
    if (signedUrl) {
      return signedUrl
    }
    if (attempt < SYNC_CONFIG.objectMetadataPollAttempts - 1) {
      await sleepMs(delay)
      if (delay < SYNC_CONFIG.objectMetadataPollMaxBackoffMs) {
        delay *= 2
      }
    }
  }
  return null
}

async function resolveDownloadURL(ctx: ActionCtx, key: string, keyURLCache: Map<string, string | null>) {
  if (keyURLCache.has(key)) {
    return keyURLCache.get(key) || null
  }

  const quickMetadata = await r2.getMetadata(ctx, key)
  let downloadURL: string | null = null
  if (quickMetadata?.url) {
    downloadURL = quickMetadata.url
  } else {
    downloadURL = await getSignedDownloadUrlByHead(key)
  }
  keyURLCache.set(key, downloadURL)
  if (downloadURL) {
    return downloadURL
  }

  downloadURL = await getDownloadUrlWithMetadataSync(ctx, key)
  keyURLCache.set(key, downloadURL)
  return downloadURL
}

function blobKeys(_kind: SyncKind, sha256: string) {
  return [`blobs/${sha256}`]
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
  const rawBytes = await fetchObjectBytes(ctx, key)
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
