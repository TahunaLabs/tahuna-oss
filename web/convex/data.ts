import { ConvexError, v } from "convex/values";
import type { DataModel } from "@convex/_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { shortId } from "@convex/ids";
import { UPLOAD_LIMITS_BYTES } from "@convex/appConfig";
import { storageKeys } from "@convex/core/storage";
import { createObjectStoreClientApi, objectStore } from "@convex/objectStore";

const DEFAULT_LIST_LIMIT = 1000;
const MAX_LIST_LIMIT = 1000;
const CURSOR_PREFIX = "offset:";

function decodeFilename(encoded: string) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function buildDataPath(blobId: string, filename: string) {
  return storageKeys.dataUploadObjectKey(blobId, filename);
}

function parseKey(key: string) {
  const prefix = storageKeys.dataUploadRootPrefix();
  const relative = key.startsWith(prefix) ? key.slice(prefix.length) : key;
  const leaf = relative.split("/").pop() ?? relative;
  const [blobId, ...filenameParts] = leaf.split("__");
  const encodedFilename = filenameParts.join("__");
  const fallback = blobId || leaf;
  return {
    blobId: fallback,
    filename: encodedFilename ? decodeFilename(encodedFilename) : fallback,
  };
}

function isTopLevelDataUploadKey(key: string) {
  const prefix = storageKeys.dataUploadRootPrefix();
  if (!key.startsWith(prefix)) {
    return false;
  }
  const relative = key.slice(prefix.length);
  return relative.includes("__") && !relative.includes("/");
}

function normalizeListLimit(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(value)));
}

function encodeOffsetCursor(offset: number) {
  return `${CURSOR_PREFIX}${offset}`;
}

function decodeOffsetCursor(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  const value = cursor.trim();
  if (!value.startsWith(CURSOR_PREFIX)) {
    return 0;
  }
  const raw = Number(value.slice(CURSOR_PREFIX.length));
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
}

function toMillis(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

const callbacks = {};

const dataBlobValidator = v.object({
  blob_id: v.string(),
  filename: v.string(),
  key: v.string(),
  content_type: v.string(),
  size: v.number(),
  download_url: v.string(),
  created_at: v.number(),
});
const listDataBlobsValidator = v.object({
  blobs: v.array(dataBlobValidator),
  has_more: v.boolean(),
  next_cursor: v.union(v.string(), v.null()),
  scan_capped: v.boolean(),
});

type DataBlobRow = {
  blob_id: string;
  filename: string;
  key: string;
  content_type: string;
  size: number;
  download_url: string;
  created_at: number;
};

async function upsertDataUploadIndexRow(
  ctx: MutationCtx,
  args: {
    userId: string;
    key: string;
    filename: string;
    blobId: string;
    size: number;
    createdAt: number;
  },
) {
  const normalizedSize = Math.max(0, Math.floor(args.size));
  const existing = await ctx.db
    .query("storageObjects")
    .withIndex("by_user_and_key", (q) => q.eq("userId", args.userId).eq("key", args.key))
    .first();
  const patch = {
    source: "data" as const,
    objectKind: "data_upload" as const,
    key: args.key,
    name: args.filename,
    size: normalizedSize,
    createdAt: Math.max(0, Math.floor(args.createdAt)),
    dataBlobId: args.blobId,
    runId: undefined,
    dataId: args.blobId,
  };
  if (existing) {
    await ctx.db.patch("storageObjects", existing._id, patch);
    return;
  }
  await ctx.db.insert("storageObjects", {
    userId: args.userId,
    ...patch,
  });
}

async function resolveDownloadUrl(ctx: QueryCtx | MutationCtx, key: string) {
  try {
    const metadata = await objectStore.getMetadata(ctx, key);
    if (metadata?.url) {
      return metadata.url;
    }
  } catch {
    // Fall through to signed URL lookup.
  }
  try {
    return (await objectStore.createSignedDownload(key)).url;
  } catch {
    return "";
  }
}

async function listBlobsForUserId(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{
  blobs: DataBlobRow[];
  has_more: boolean;
  next_cursor: string | null;
  scan_capped: boolean;
}> {
  const limit = normalizeListLimit(options?.limit);
  const offset = decodeOffsetCursor(options?.cursor);
  const byKey = new Map<string, DataBlobRow>();

  const indexedRows = await ctx.db
    .query("storageObjects")
    .withIndex("by_user_and_source", (q) => q.eq("userId", userId).eq("source", "data"))
    .collect();
  for (const row of indexedRows) {
    if (row.objectKind !== "data_upload" || !isTopLevelDataUploadKey(row.key)) {
      continue;
    }
    const parsed = parseKey(row.key);
    byKey.set(row.key, {
      blob_id: row.dataBlobId || parsed.blobId,
      filename: row.name || parsed.filename,
      key: row.key,
      content_type: "",
      size: row.size || 0,
      download_url: "",
      created_at: row.createdAt || 0,
    });
  }

  const ordered = Array.from(byKey.values()).sort((a, b) => b.created_at - a.created_at);
  const page = ordered.slice(offset, offset + limit);
  const blobs = await Promise.all(
    page.map(async (row) => ({
      ...row,
      download_url: await resolveDownloadUrl(ctx, row.key),
    })),
  );
  const hasMore = offset + limit < ordered.length;

  return {
    blobs,
    has_more: hasMore,
    next_cursor: hasMore ? encodeOffsetCursor(offset + limit) : null,
    scan_capped: false,
  };
}

export const { syncMetadata } = createObjectStoreClientApi<DataModel>({
  callbacks,
  checkUpload: async (ctx) => {
    await requireUser(ctx);
  },
  onUpload: async (ctx, _bucket, key) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    if (!isTopLevelDataUploadKey(key)) {
      throw new ConvexError("invalid upload key");
    }
    const metadata = await objectStore.getMetadata(ctx, key);
    const objectSize = typeof metadata?.size === "number" && Number.isFinite(metadata.size) ? metadata.size : 0;
    if (objectSize > UPLOAD_LIMITS_BYTES.dataBlob) {
      try {
        await objectStore.deleteObject(ctx, key);
      } catch {
        // Ignore cleanup errors and return the original size violation.
      }
      throw new ConvexError(`data file exceeds limit of ${UPLOAD_LIMITS_BYTES.dataBlob} bytes`);
    }
    const parsed = parseKey(key);
    const filename = parsed.filename.trim() || "file";
    const blobId = parsed.blobId.trim();
    const createdAt = toMillis(metadata?.lastModified, Date.now());
    try {
      await upsertDataUploadIndexRow(ctx as MutationCtx, {
        userId,
        key,
        filename,
        blobId: blobId || shortId("blob"),
        size: objectSize,
        createdAt,
      });
    } catch (error) {
      try {
        await objectStore.deleteObject(ctx, key);
      } catch {
        // best-effort cleanup when post-upload validation fails
      }
      throw error;
    }
  },
});

export const generateUploadUrl = mutation({
  args: {
    filename: v.string(),
    size_bytes: v.number(),
  },
  returns: v.object({
    blob_id: v.string(),
    filename: v.string(),
    key: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!Number.isInteger(args.size_bytes) || args.size_bytes <= 0) {
      throw new ConvexError("size_bytes must be a positive integer");
    }
    if (args.size_bytes > UPLOAD_LIMITS_BYTES.dataBlob) {
      throw new ConvexError(`data file exceeds limit of ${UPLOAD_LIMITS_BYTES.dataBlob} bytes`);
    }
    const blobId = shortId("blob");
    const key = buildDataPath(blobId, args.filename);
    const upload = await objectStore.createSignedUpload(key);

    return {
      blob_id: blobId,
      filename: args.filename,
      key: upload.key,
      url: upload.url,
    };
  },
});

export const list = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: listDataBlobsValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await listBlobsForUserId(ctx, String(user._id), {
      cursor: args.cursor,
      limit: args.limit,
    });
  },
});

export const internalList = internalQuery({
  args: {
    userId: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: listDataBlobsValidator,
  handler: async (ctx, args) => {
    return await listBlobsForUserId(ctx, args.userId, {
      cursor: args.cursor,
      limit: args.limit,
    });
  },
});
