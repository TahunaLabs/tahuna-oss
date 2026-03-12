import { R2 } from "@convex-dev/r2"
import { ConvexError, v } from "convex/values"
import { CopyObjectCommand } from "@aws-sdk/client-s3"
import { components, internal } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { action, internalMutation, type ActionCtx, type MutationCtx } from "@convex/_generated/server"
import { requireUser } from "@convex/auth"

const r2 = new R2(components.r2)

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_ARTIFACTS_SCANNED = 600
const METADATA_LOOKUP_CONCURRENCY = 20
const MAX_SEARCH_CHARS = 120
const MAX_ARTIFACT_NAME_CHARS = 255

const sortValidator = v.union(
  v.literal("created_desc"),
  v.literal("created_asc"),
  v.literal("name_asc"),
  v.literal("name_desc"),
  v.literal("size_desc"),
  v.literal("size_asc"),
)

const sourceFilterValidator = v.union(v.literal("all"), v.literal("data"), v.literal("run_artifact"))

const storageItemValidator = v.object({
  id: v.string(),
  source: v.union(v.literal("data"), v.literal("run_artifact")),
  key: v.string(),
  name: v.string(),
  path: v.string(),
  size: v.number(),
  created_at: v.number(),
  download_url: v.string(),
  run_id: v.optional(v.string()),
  data_blob_id: v.optional(v.string()),
})

const storageListValidator = v.object({
  items: v.array(storageItemValidator),
  total: v.number(),
  offset: v.number(),
  limit: v.number(),
  has_more: v.boolean(),
  next_offset: v.union(v.number(), v.null()),
  next_cursor: v.union(v.string(), v.null()),
  scan_capped: v.object({
    data: v.boolean(),
    run_artifact: v.boolean(),
  }),
})

const renameArtifactResultValidator = v.object({
  run_id: v.string(),
  key: v.string(),
  name: v.string(),
  path: v.string(),
  download_url: v.string(),
  cleanup_warning: v.boolean(),
})

type StorageItem = {
  id: string
  source: "data" | "run_artifact"
  key: string
  name: string
  path: string
  size: number
  created_at: number
  download_url: string
  run_id?: string
  data_blob_id?: string
}

type StorageSort = "created_desc" | "created_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc"
type ArtifactRef = {
  key: string
  runId: string
  runCreatedAt: number
}
type DataBlobListRow = {
  blob_id: string
  filename: string
  key: string
  size: number
  download_url: string
  created_at: number
}
type DataBlobListResult = {
  blobs: DataBlobListRow[]
  has_more: boolean
  next_cursor: string | null
  scan_capped: boolean
}
type RunListRow = {
  run_id: string
  created_at: number
  artifact_keys: string[]
}
type RunListResult = {
  runs: RunListRow[]
}

function encodeOffsetCursor(offset: number) {
  return `offset:${offset}`
}

function decodeOffsetCursor(cursor: string): number | null {
  const value = cursor.trim()
  if (!value.startsWith("offset:")) {
    return null
  }
  const raw = Number(value.slice("offset:".length))
  if (!Number.isFinite(raw)) {
    return null
  }
  return Math.max(0, Math.floor(raw))
}

function normalizeArtifactName(value: string) {
  const name = value.trim()
  if (!name) {
    throw new ConvexError("artifact name is required")
  }
  if (name.length > MAX_ARTIFACT_NAME_CHARS) {
    throw new ConvexError(`artifact name must be ${MAX_ARTIFACT_NAME_CHARS} characters or fewer`)
  }
  if (name === "." || name === "..") {
    throw new ConvexError("artifact name is invalid")
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new ConvexError("artifact name must not include path separators")
  }
  if (/[\u0000-\u001f]/.test(name)) {
    throw new ConvexError("artifact name contains unsupported control characters")
  }
  return name
}

function buildRenamedKey(currentKey: string, nextName: string) {
  const key = currentKey.trim()
  if (!key) {
    throw new ConvexError("artifact key is required")
  }
  const slashIndex = key.lastIndexOf("/")
  if (slashIndex < 0 || slashIndex >= key.length - 1) {
    throw new ConvexError("artifact key is invalid")
  }
  const currentName = key.slice(slashIndex + 1)
  const parentPrefix = key.slice(0, slashIndex + 1)
  return {
    currentName,
    fromKey: key,
    toKey: `${parentPrefix}${nextName}`,
  }
}

async function getOwnedRun(ctx: MutationCtx, userId: string, runId: Id<"runs">) {
  const run = await ctx.db.get("runs", runId)
  if (!run || run.userId !== userId) {
    throw new ConvexError("run not found")
  }
  return run
}

function toTimestamp(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const millis = new Date(value).getTime()
  return Number.isFinite(millis) ? millis : fallback
}

function normalizeLimit(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIMIT
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)))
}

function normalizeOffset(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.floor(value))
}

function sortItems(items: StorageItem[], sort: StorageSort) {
  return items.sort((a, b) => {
    if (sort === "created_asc") {
      if (a.created_at !== b.created_at) return a.created_at - b.created_at
      return a.key.localeCompare(b.key)
    }
    if (sort === "created_desc") {
      if (a.created_at !== b.created_at) return b.created_at - a.created_at
      return a.key.localeCompare(b.key)
    }
    if (sort === "size_asc") {
      if (a.size !== b.size) return a.size - b.size
      return a.key.localeCompare(b.key)
    }
    if (sort === "size_desc") {
      if (a.size !== b.size) return b.size - a.size
      return a.key.localeCompare(b.key)
    }
    if (sort === "name_asc") {
      const byName = a.name.localeCompare(b.name)
      if (byName !== 0) return byName
      return a.key.localeCompare(b.key)
    }
    const byName = b.name.localeCompare(a.name)
    if (byName !== 0) return byName
    return a.key.localeCompare(b.key)
  })
}

function matchesSearch(item: StorageItem, search: string) {
  if (!search) return true
  const haystack = [item.name, item.path, item.run_id || "", item.data_blob_id || ""].join(" ").toLowerCase()
  return haystack.includes(search)
}

function shouldUseFullArtifactMetadata(sort: StorageSort) {
  return sort === "size_asc" || sort === "size_desc"
}

function listArtifactRefsFromRuns(rows: RunListRow[]): { refs: ArtifactRef[]; scanCapped: boolean } {
  const refs: ArtifactRef[] = []
  const sortedRuns = [...rows].sort((a, b) => b.created_at - a.created_at)
  let scanCapped = false

  for (const run of sortedRuns) {
    for (const key of run.artifact_keys || []) {
      if (!key.trim()) continue
      refs.push({
        key: key.trim(),
        runId: run.run_id,
        runCreatedAt: run.created_at,
      })
      if (refs.length >= MAX_ARTIFACTS_SCANNED) {
        scanCapped = true
        break
      }
    }
    if (refs.length >= MAX_ARTIFACTS_SCANNED) {
      scanCapped = true
      break
    }
  }

  return { refs, scanCapped }
}

async function listArtifactItemsForUserFast(refs: ArtifactRef[]) {
  const out: StorageItem[] = []
  for (let index = 0; index < refs.length; index += METADATA_LOOKUP_CONCURRENCY) {
    const chunk = refs.slice(index, index + METADATA_LOOKUP_CONCURRENCY)
    const items = await Promise.all(
      chunk.map(async (ref) => {
        try {
          const downloadURL = await r2.getUrl(ref.key)
          const leafName = ref.key.split("/").pop() || ref.key
          return {
            id: `artifact:${ref.key}`,
            source: "run_artifact" as const,
            key: ref.key,
            name: leafName,
            path: ref.key,
            size: 0,
            created_at: ref.runCreatedAt,
            download_url: downloadURL,
            run_id: ref.runId,
          }
        } catch {
          return null
        }
      }),
    )
    for (const row of items) {
      if (row) out.push(row)
    }
  }
  return out
}

async function listArtifactItemsForUserWithMetadata(ctx: ActionCtx, refs: ArtifactRef[]) {
  const out: StorageItem[] = []
  for (let index = 0; index < refs.length; index += METADATA_LOOKUP_CONCURRENCY) {
    const chunk = refs.slice(index, index + METADATA_LOOKUP_CONCURRENCY)
    const metadataRows = await Promise.all(
      chunk.map(async (ref) => {
        const metadata = await r2.getMetadata(ctx, ref.key)
        if (!metadata?.url) return null
        const leafName = ref.key.split("/").pop() || ref.key
        return {
          id: `artifact:${ref.key}`,
          source: "run_artifact" as const,
          key: ref.key,
          name: leafName,
          path: ref.key,
          size: metadata.size || 0,
          created_at: toTimestamp(metadata.lastModified, ref.runCreatedAt),
          download_url: metadata.url,
          run_id: ref.runId,
        }
      }),
    )

    for (const row of metadataRows) {
      if (row) out.push(row)
    }
  }

  return out
}

async function hydrateVisibleArtifactMetadata(ctx: ActionCtx, pageItems: StorageItem[]) {
  const out = [...pageItems]
  const artifactIndexes: number[] = []
  for (let i = 0; i < out.length; i += 1) {
    if (out[i]?.source === "run_artifact") {
      artifactIndexes.push(i)
    }
  }
  if (artifactIndexes.length === 0) {
    return out
  }

  for (let start = 0; start < artifactIndexes.length; start += METADATA_LOOKUP_CONCURRENCY) {
    const slice = artifactIndexes.slice(start, start + METADATA_LOOKUP_CONCURRENCY)
    const metadataRows = await Promise.all(
      slice.map(async (itemIndex) => {
        const row = out[itemIndex]
        if (!row) return { itemIndex, metadata: null as null | { size?: number; lastModified?: string; url?: string } }
        try {
          const metadata = await r2.getMetadata(ctx, row.key)
          return { itemIndex, metadata: metadata ?? null }
        } catch {
          return { itemIndex, metadata: null as null | { size?: number; lastModified?: string; url?: string } }
        }
      }),
    )
    for (const { itemIndex, metadata } of metadataRows) {
      const row = out[itemIndex]
      if (!row || !metadata) continue
      out[itemIndex] = {
        ...row,
        size: typeof metadata.size === "number" ? metadata.size : row.size,
        created_at: toTimestamp(metadata.lastModified, row.created_at),
        download_url: metadata.url || row.download_url,
      }
    }
  }

  return out
}

export const internalPrepareArtifactRename = internalMutation({
  args: {
    userId: v.string(),
    runId: v.id("runs"),
    key: v.string(),
    name: v.string(),
  },
  returns: v.object({
    runId: v.id("runs"),
    fromKey: v.string(),
    toKey: v.string(),
    name: v.string(),
  }),
  handler: async (ctx, args) => {
    const run = await getOwnedRun(ctx, args.userId, args.runId)
    const name = normalizeArtifactName(args.name)
    const { currentName, fromKey, toKey } = buildRenamedKey(args.key, name)

    if (currentName === name) {
      throw new ConvexError("new artifact name must differ from the current name")
    }
    const artifactKeys = run.artifactKeys || []
    if (!artifactKeys.includes(fromKey)) {
      throw new ConvexError("artifact not found in run outputs")
    }
    if (artifactKeys.includes(toKey)) {
      throw new ConvexError("artifact name already exists in this run")
    }

    const [sourceMetadata, targetMetadata] = await Promise.all([
      r2.getMetadata(ctx, fromKey),
      r2.getMetadata(ctx, toKey),
    ])
    if (!sourceMetadata?.url) {
      throw new ConvexError("artifact object is missing from storage")
    }
    if (targetMetadata?.url) {
      throw new ConvexError("artifact name already exists in storage")
    }

    return {
      runId: args.runId,
      fromKey,
      toKey,
      name,
    }
  },
})

export const internalFinalizeArtifactRename = internalMutation({
  args: {
    userId: v.string(),
    runId: v.id("runs"),
    fromKey: v.string(),
    toKey: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await getOwnedRun(ctx, args.userId, args.runId)
    const artifactKeys = run.artifactKeys || []

    if (!artifactKeys.includes(args.fromKey)) {
      throw new ConvexError("artifact rename conflict detected; refresh and retry")
    }
    if (artifactKeys.includes(args.toKey)) {
      throw new ConvexError("artifact name is already used by this run")
    }

    await ctx.db.patch("runs", args.runId, {
      artifactKeys: artifactKeys.map((key) => (key === args.fromKey ? args.toKey : key)),
    })
    await ctx.db.insert("runEvents", {
      runId: args.runId,
      status: run.status,
      message: "artifact renamed",
      metadata: {
        from_key: args.fromKey,
        to_key: args.toKey,
      },
    })
    return null
  },
})

export const renameArtifact = action({
  args: {
    runId: v.id("runs"),
    key: v.string(),
    name: v.string(),
  },
  returns: renameArtifactResultValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const userId = String(user._id)

    const renamePlan = (await ctx.runMutation(internal.storage.internalPrepareArtifactRename, {
      userId,
      runId: args.runId,
      key: args.key,
      name: args.name,
    })) as {
      runId: Id<"runs">
      fromKey: string
      toKey: string
      name: string
    }

    const copySource = `${r2.config.bucket}/${encodeURIComponent(renamePlan.fromKey).replace(/%2F/g, "/")}`
    await r2.client.send(
      new CopyObjectCommand({
        Bucket: r2.config.bucket,
        CopySource: copySource,
        Key: renamePlan.toKey,
        MetadataDirective: "COPY",
      }),
    )

    await r2.syncMetadata(ctx, renamePlan.toKey)
    const metadata = await r2.getMetadata(ctx, renamePlan.toKey)
    if (!metadata?.url) {
      throw new ConvexError("renamed artifact metadata could not be loaded")
    }

    try {
      await ctx.runMutation(internal.storage.internalFinalizeArtifactRename, {
        userId,
        runId: renamePlan.runId,
        fromKey: renamePlan.fromKey,
        toKey: renamePlan.toKey,
      })
    } catch (error) {
      try {
        await r2.deleteObject(ctx, renamePlan.toKey)
      } catch {
        // Ignore rollback cleanup failures and surface the original conflict/error.
      }
      throw error
    }

    let cleanupWarning = false
    try {
      await r2.deleteObject(ctx, renamePlan.fromKey)
    } catch {
      cleanupWarning = true
    }

    return {
      run_id: String(renamePlan.runId),
      key: renamePlan.toKey,
      name: renamePlan.name,
      path: renamePlan.toKey,
      download_url: metadata.url,
      cleanup_warning: cleanupWarning,
    }
  },
})

export const list = action({
  args: {
    source: v.optional(sourceFilterValidator),
    search: v.optional(v.string()),
    sort: v.optional(sortValidator),
    cursor: v.optional(v.string()),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: storageListValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const userId = String(user._id)

    const source = args.source ?? "all"
    const sort: StorageSort = args.sort ?? "created_desc"
    const search = (args.search || "").trim().slice(0, MAX_SEARCH_CHARS).toLowerCase()
    const limit = normalizeLimit(args.limit)
    const cursorOffset = typeof args.cursor === "string" ? decodeOffsetCursor(args.cursor) : null
    if (typeof args.cursor === "string" && cursorOffset === null) {
      throw new ConvexError("invalid storage cursor")
    }
    const offset = cursorOffset ?? normalizeOffset(args.offset)

    const useFullArtifactMetadata = shouldUseFullArtifactMetadata(sort)
    const [dataRows, runRows] = await Promise.all([
      source === "all" || source === "data"
        ? ctx.runQuery(internal.data.internalList, { userId, limit: 1000 })
        : Promise.resolve({
            blobs: [] as DataBlobListRow[],
            has_more: false,
            next_cursor: null,
            scan_capped: false,
          }),
      source === "all" || source === "run_artifact"
        ? ctx.runQuery(internal.runs.internalList, { userId })
        : Promise.resolve({ runs: [] as RunListRow[] }),
    ])
    const dataList = dataRows as DataBlobListResult
    const runsList = runRows as RunListResult
    const dataItems: StorageItem[] = dataRows.blobs.map((blob) => ({
      id: `data:${blob.key}`,
      source: "data",
      key: blob.key,
      name: blob.filename,
      path: blob.key,
      size: blob.size,
      created_at: blob.created_at,
      download_url: blob.download_url,
      data_blob_id: blob.blob_id,
    }))
    const { refs: artifactRefs, scanCapped: artifactScanCapped } = listArtifactRefsFromRuns(runsList.runs)
    const artifactItems =
      source === "all" || source === "run_artifact"
        ? useFullArtifactMetadata
          ? await listArtifactItemsForUserWithMetadata(ctx, artifactRefs)
          : await listArtifactItemsForUserFast(artifactRefs)
        : []

    const combined = sortItems(
      [...dataItems, ...artifactItems].filter((item) => matchesSearch(item, search)),
      sort,
    )
    const total = combined.length
    const pageItems = combined.slice(offset, offset + limit)
    const items = useFullArtifactMetadata ? pageItems : await hydrateVisibleArtifactMetadata(ctx, pageItems)
    const hasMore = offset + limit < total

    return {
      items,
      total,
      offset,
      limit,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
      next_cursor: hasMore ? encodeOffsetCursor(offset + limit) : null,
      scan_capped: {
        data: dataList.scan_capped || dataList.has_more,
        run_artifact: artifactScanCapped,
      },
    }
  },
})
