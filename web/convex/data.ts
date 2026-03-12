import { R2, type R2Callbacks } from "@convex-dev/r2";
import { ConvexError, v } from "convex/values";
import { components } from "@convex/_generated/api";
import type { DataModel } from "@convex/_generated/dataModel";
import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { shortId } from "@convex/ids";
import { UPLOAD_LIMITS_BYTES } from "../config";

const r2 = new R2(components.r2);

function buildDataPrefix(userId: string) {
  return `${userId}/data/`;
}

function encodeFilename(filename: string) {
  return encodeURIComponent(filename.trim() || "file");
}

function decodeFilename(encoded: string) {
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function buildDataPath(userId: string, blobId: string, filename: string) {
  return `${buildDataPrefix(userId)}${blobId}__${encodeFilename(filename)}`;
}

function parseKey(key: string) {
  const leaf = key.split("/").pop() ?? key;
  const [blobId, ...filenameParts] = leaf.split("__");
  const encodedFilename = filenameParts.join("__");
  return {
    blobId,
    filename: encodedFilename ? decodeFilename(encodedFilename) : blobId,
  };
}

function isTopLevelDataUploadKey(userId: string, key: string) {
  const prefix = buildDataPrefix(userId);
  if (!key.startsWith(prefix)) {
    return false;
  }
  const relative = key.slice(prefix.length);
  // Keep only upload objects shaped as "<blob_id>__<filename>" at the root data prefix.
  return relative.includes("__") && !relative.includes("/");
}

const callbacks: R2Callbacks = {};

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

async function listBlobsForUserId(ctx: QueryCtx | MutationCtx, userId: string): Promise<DataBlobRow[]> {
  const prefix = buildDataPrefix(userId);
  const blobs: DataBlobRow[] = [];

  let cursor: string | null = null;
  let pages = 0;

  while (pages < 10) {
    const result = await r2.listMetadata(ctx, 100, cursor);
    for (const item of result.page) {
      if (!item.key.startsWith(prefix)) continue;
      if (!isTopLevelDataUploadKey(userId, item.key)) continue;
      const parsed = parseKey(item.key);
      blobs.push({
        blob_id: parsed.blobId,
        filename: parsed.filename,
        key: item.key,
        content_type: item.contentType || "",
        size: item.size || 0,
        download_url: item.url,
        created_at: new Date(item.lastModified).getTime(),
      });
    }

    if (result.isDone) break;
    cursor = result.continueCursor;
    pages += 1;
  }

  blobs.sort((a, b) => b.created_at - a.created_at);
  return blobs;
}

export const { syncMetadata } = r2.clientApi<DataModel>({
  callbacks,
  checkUpload: async (ctx) => {
    await requireUser(ctx);
  },
  onUpload: async (ctx, _bucket, key) => {
    const user = await requireUser(ctx);
    if (!key.startsWith(buildDataPrefix(String(user._id)))) {
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
    if (!Number.isInteger(args.size_bytes) || args.size_bytes <= 0) {
      throw new ConvexError("size_bytes must be a positive integer");
    }
    if (args.size_bytes > UPLOAD_LIMITS_BYTES.dataBlob) {
      throw new ConvexError(`data file exceeds limit of ${UPLOAD_LIMITS_BYTES.dataBlob} bytes`);
    }
    const blobId = shortId("blob");
    const key = buildDataPath(String(user._id), blobId, args.filename);
    const upload = await r2.generateUploadUrl(key);

    return {
      blob_id: blobId,
      filename: args.filename,
      key: upload.key,
      url: upload.url,
    };
  },
});

export const list = query({
  args: {},
  returns: listDataBlobsValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const blobs = await listBlobsForUserId(ctx, String(user._id));
    return { blobs };
  },
});

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listDataBlobsValidator,
  handler: async (ctx, args) => {
    const blobs = await listBlobsForUserId(ctx, args.userId);
    return { blobs };
  },
});
