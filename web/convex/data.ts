import { R2, type R2Callbacks } from "@convex-dev/r2";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./auth-helpers";
import { shortId } from "./ids";

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

const callbacks: R2Callbacks = {};

export const { syncMetadata } = r2.clientApi<DataModel>({
  callbacks,
  checkUpload: async (ctx) => {
    await requireUser(ctx);
  },
  onUpload: async (ctx, _bucket, key) => {
    const user = await requireUser(ctx);
    if (!key.startsWith(buildDataPrefix(String(user._id)))) {
      throw new Error("invalid upload key");
    }
  },
});

export const generateUploadUrl = mutation({
  args: {
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
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
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const prefix = buildDataPrefix(String(user._id));
    const blobs: Array<{
      blob_id: string;
      filename: string;
      key: string;
      content_type: string;
      size: number;
      download_url: string;
      created_at: number;
    }> = [];

    let cursor: string | null = null;
    let pages = 0;

    while (pages < 10) {
      const result = await r2.listMetadata(ctx, 100, cursor);
      for (const item of result.page) {
        if (!item.key.startsWith(prefix)) continue;
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
    return { blobs };
  },
});

export const remove = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!args.key.startsWith(buildDataPrefix(String(user._id)))) {
      throw new Error("blob not found");
    }

    await r2.deleteObject(ctx, args.key);
    return { deleted: true, key: args.key };
  },
});
