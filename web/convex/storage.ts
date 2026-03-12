import { R2 } from "@convex-dev/r2"
import { v } from "convex/values"
import { components } from "@convex/_generated/api"
import { query, type QueryCtx } from "@convex/_generated/server"
import { requireUser } from "@convex/auth"

const r2 = new R2(components.r2)

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const MAX_DATA_LIST_PAGES = 20
const MAX_ARTIFACTS_SCANNED = 600
const METADATA_LOOKUP_CONCURRENCY = 20
const MAX_SEARCH_CHARS = 120

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

function buildDataPrefix(userId: string) {
  return `${userId}/data/`
}

function decodeFilename(encoded: string) {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

function parseDataKey(key: string) {
  const leaf = key.split("/").pop() ?? key
  const [blobId, ...filenameParts] = leaf.split("__")
  const encodedFilename = filenameParts.join("__")
  return {
    blobId,
    filename: encodedFilename ? decodeFilename(encodedFilename) : blobId,
  }
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

function sortItems(items: StorageItem[], sort: "created_desc" | "created_asc" | "name_asc" | "name_desc" | "size_desc" | "size_asc") {
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

async function listDataItemsForUser(ctx: QueryCtx, userId: string) {
  const prefix = buildDataPrefix(userId)
  const out: StorageItem[] = []

  let cursor: string | null = null
  let pages = 0

  while (pages < MAX_DATA_LIST_PAGES) {
    const result = await r2.listMetadata(ctx, 100, cursor)
    for (const item of result.page) {
      if (!item.key.startsWith(prefix)) continue
      const parsed = parseDataKey(item.key)
      out.push({
        id: `data:${item.key}`,
        source: "data",
        key: item.key,
        name: parsed.filename,
        path: item.key,
        size: item.size || 0,
        created_at: toTimestamp(item.lastModified, 0),
        download_url: item.url,
        data_blob_id: parsed.blobId,
      })
    }
    if (result.isDone) break
    cursor = result.continueCursor
    pages += 1
  }

  return out
}

async function listArtifactItemsForUser(ctx: QueryCtx, userId: string) {
  const out: StorageItem[] = []
  const rows = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()

  const refs: Array<{ key: string; runId: string; runCreatedAt: number }> = []
  const sortedRuns = rows.sort((a, b) => b._creationTime - a._creationTime)

  for (const run of sortedRuns) {
    for (const key of run.artifactKeys || []) {
      if (!key.trim()) continue
      refs.push({
        key: key.trim(),
        runId: String(run._id),
        runCreatedAt: run._creationTime,
      })
      if (refs.length >= MAX_ARTIFACTS_SCANNED) {
        break
      }
    }
    if (refs.length >= MAX_ARTIFACTS_SCANNED) {
      break
    }
  }

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

export const list = query({
  args: {
    source: v.optional(sourceFilterValidator),
    search: v.optional(v.string()),
    sort: v.optional(sortValidator),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: storageListValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const userId = String(user._id)

    const source = args.source ?? "all"
    const sort = args.sort ?? "created_desc"
    const search = (args.search || "").trim().slice(0, MAX_SEARCH_CHARS).toLowerCase()
    const limit = normalizeLimit(args.limit)
    const offset = normalizeOffset(args.offset)

    const [dataItems, artifactItems] = await Promise.all([
      source === "all" || source === "data" ? listDataItemsForUser(ctx, userId) : Promise.resolve([] as StorageItem[]),
      source === "all" || source === "run_artifact"
        ? listArtifactItemsForUser(ctx, userId)
        : Promise.resolve([] as StorageItem[]),
    ])

    const combined = sortItems(
      [...dataItems, ...artifactItems].filter((item) => matchesSearch(item, search)),
      sort,
    )
    const total = combined.length
    const items = combined.slice(offset, offset + limit)
    const hasMore = offset + limit < total

    return {
      items,
      total,
      offset,
      limit,
      has_more: hasMore,
      next_offset: hasMore ? offset + limit : null,
    }
  },
})
