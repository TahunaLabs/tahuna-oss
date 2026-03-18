import { R2, type R2Callbacks } from "@convex-dev/r2";
import { ConvexError, v } from "convex/values";
import { components } from "@convex/_generated/api";
import type { DataModel } from "@convex/_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { shortId } from "@convex/ids";
import { UPLOAD_LIMITS_BYTES } from "@convex/appConfig";

const r2 = new R2(components.r2);
const DEFAULT_LIST_LIMIT = 1000;
const MAX_LIST_LIMIT = 1000;

function encodeFilename(filename: string) {
  return encodeURIComponent(filename.trim() || "file");
}

function buildDataPath(blobId: string, filename: string) {
  return `data/${blobId}__${encodeFilename(filename)}`;
}

const callbacks: R2Callbacks = {};

const DATA_KEY_PREFIX = "data/";

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

function normalizeListLimit(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(value)));
}

async function listBlobsForUserId(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  options?: { limit?: number },
): Promise<{
  blobs: DataBlobRow[];
  has_more: boolean;
  next_cursor: string | null;
  scan_capped: boolean;
}> {
  const limit = normalizeListLimit(options?.limit);
  const rows = await ctx.db
    .query("dataBlobs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const blobs: DataBlobRow[] = [];
  for (const row of rows) {
    const metadata = await r2.getMetadata(ctx, row.key);
    blobs.push({
      blob_id: row.blobId,
      filename: row.filename,
      key: row.key,
      content_type: "",
      size: row.size,
      download_url: metadata?.url ?? "",
      created_at: row.createdAt,
    });
  }

  blobs.sort((a, b) => b.created_at - a.created_at);
  const hasMore = blobs.length > limit;
  const trimmed = blobs.slice(0, limit);
  return {
    blobs: trimmed,
    has_more: hasMore,
    next_cursor: null,
    scan_capped: false,
  };
}

export const { syncMetadata } = r2.clientApi<DataModel>({
  callbacks,
  checkUpload: async (ctx) => {
    await requireUser(ctx);
  },
  onUpload: async (ctx, _bucket, key) => {
    await requireUser(ctx);
    if (!key.startsWith(DATA_KEY_PREFIX)) {
      throw new ConvexError("invalid upload key");
    }
    const metadata = await r2.getMetadata(ctx, key);
    const objectSize = typeof metadata?.size === "number" && Number.isFinite(metadata.size) ? metadata.size : 0;
    if (objectSize > UPLOAD_LIMITS_BYTES.dataBlob) {
      try {
        await r2.deleteObject(ctx, key);
      } catch {
        // Ignore cleanup errors and return the original size violation.
      }
      throw new ConvexError(`data file exceeds limit of ${UPLOAD_LIMITS_BYTES.dataBlob} bytes`);
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
    const user = await requireUser(ctx);
    const userId = String(user._id);
    if (!Number.isInteger(args.size_bytes) || args.size_bytes <= 0) {
      throw new ConvexError("size_bytes must be a positive integer");
    }
    if (args.size_bytes > UPLOAD_LIMITS_BYTES.dataBlob) {
      throw new ConvexError(`data file exceeds limit of ${UPLOAD_LIMITS_BYTES.dataBlob} bytes`);
    }
    const blobId = shortId("blob");
    const key = buildDataPath(blobId, args.filename);
    const upload = await r2.generateUploadUrl(key);

    await ctx.db.insert("dataBlobs", {
      userId,
      blobId,
      filename: args.filename,
      key: upload.key,
      size: args.size_bytes,
      createdAt: Date.now(),
    });

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
      limit: args.limit,
    });
  },
});
