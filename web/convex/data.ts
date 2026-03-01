import { R2 } from "@convex-dev/r2";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { shortId } from "./ids";

const r2 = new R2(components.r2);

async function requireUser(ctx: any) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

function buildDataPath(userId: string, blobId: string) {
  return `${userId}/data/${blobId}`;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("dataBlobs")
      .withIndex("by_user", (q) => q.eq("userId", String(user._id)))
      .collect();

    const blobs = await Promise.all(
      rows
        .sort((a, b) => b._creationTime - a._creationTime)
        .map(async (row) => ({
          data_blob_id: String(row._id),
          blob_id: row.blobId,
          key: row.key,
          path: row.path,
          filename: row.filename,
          content_type: row.contentType || "",
          size: row.size || 0,
          download_url: await r2.getUrl(row.key, { expiresIn: 60 * 60 }),
          created_at: row._creationTime,
        })),
    );

    return { blobs };
  },
});

export const generateUploadUrl = mutation({
  args: {
    filename: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const blobId = shortId("blob");
    const path = buildDataPath(String(user._id), blobId);
    const { key, url } = await r2.generateUploadUrl(path);

    return {
      blob_id: blobId,
      filename: args.filename,
      key,
      path,
      upload_url: url,
    };
  },
});

export const completeUpload = mutation({
  args: {
    blobId: v.string(),
    key: v.string(),
    filename: v.string(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const expectedPath = buildDataPath(String(user._id), args.blobId);
    if (args.key !== expectedPath) {
      throw new Error("upload key does not match the authenticated user");
    }

    const existing = await ctx.db
      .query("dataBlobs")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      if (existing.userId !== String(user._id)) {
        throw new Error("blob not found");
      }

      await ctx.db.patch(existing._id, {
        filename: args.filename,
        contentType: args.contentType,
        size: args.size,
      });

      return {
        data_blob_id: String(existing._id),
        blob_id: existing.blobId,
        path: existing.path,
      };
    }

    const dataBlobId = await ctx.db.insert("dataBlobs", {
      userId: String(user._id),
      blobId: args.blobId,
      key: args.key,
      path: expectedPath,
      filename: args.filename,
      contentType: args.contentType,
      size: args.size,
    });

    return {
      data_blob_id: String(dataBlobId),
      blob_id: args.blobId,
      path: expectedPath,
    };
  },
});

export const remove = mutation({
  args: {
    dataBlobId: v.id("dataBlobs"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(args.dataBlobId);
    if (!row || row.userId !== String(user._id)) {
      throw new Error("blob not found");
    }

    await r2.deleteObject(ctx, row.key);
    await ctx.db.delete(args.dataBlobId);

    return {
      deleted: true,
      data_blob_id: String(args.dataBlobId),
      path: row.path,
    };
  },
});
