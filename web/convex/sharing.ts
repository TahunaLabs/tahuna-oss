import { ConvexError, v } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";

type ResourceType = "environment" | "run" | "data";

async function ownsDataResource(ctx: QueryCtx | MutationCtx, userId: string, resourceId: string): Promise<boolean> {
  const rows = await ctx.db
    .query("storageObjects")
    .withIndex("by_user_and_source", (q) => q.eq("userId", userId).eq("source", "data"))
    .collect();
  return rows.some(
    (row) => row.objectKind === "data_upload" && (row.dataBlobId === resourceId || row.dataId === resourceId),
  );
}

async function isOwner(ctx: QueryCtx | MutationCtx, userId: string, resourceType: ResourceType, resourceId: string): Promise<boolean> {
  if (resourceType === "environment") {
    const env = await ctx.db.get(resourceId as Id<"environments">);
    return !!env && env.userId === userId;
  }
  if (resourceType === "run") {
    const run = await ctx.db.get(resourceId as Id<"runs">);
    return !!run && run.userId === userId;
  }
  if (resourceType === "data") {
    return await ownsDataResource(ctx, userId, resourceId);
  }
  return false;
}

export const createShareLink = mutation({
  args: {
    resourceType: v.union(v.literal("environment"), v.literal("run"), v.literal("data")),
    resourceId: v.string(),
    permission: v.union(v.literal("read"), v.literal("edit")),
  },
  returns: v.object({ share_link_id: v.string(), token: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    if (!(await isOwner(ctx, userId, args.resourceType, args.resourceId))) {
      throw new ConvexError("only the owner can share this resource");
    }
    const token = crypto.randomUUID().replace(/-/g, "");
    const id = await ctx.db.insert("shareLinks", {
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      token,
      permission: args.permission,
      createdByUserId: userId,
    });
    return { share_link_id: String(id), token };
  },
});

export const revokeShareLink = mutation({
  args: { shareLinkId: v.id("shareLinks") },
  returns: v.object({ revoked: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const link = await ctx.db.get(args.shareLinkId);
    if (!link) {
      throw new ConvexError("share link not found");
    }
    if (link.createdByUserId !== userId) {
      if (!(await isOwner(ctx, userId, link.resourceType, link.resourceId))) {
        throw new ConvexError("only the owner can revoke this share link");
      }
    }
    await ctx.db.delete(args.shareLinkId);
    return { revoked: true };
  },
});

export const listShareLinksForResource = query({
  args: {
    resourceType: v.union(v.literal("environment"), v.literal("run"), v.literal("data")),
    resourceId: v.string(),
  },
  returns: v.object({
    shareLinks: v.array(
      v.object({
        share_link_id: v.string(),
        token: v.string(),
        permission: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    if (!(await isOwner(ctx, userId, args.resourceType, args.resourceId))) {
      return { shareLinks: [] };
    }
    const links = await ctx.db
      .query("shareLinks")
      .withIndex("by_resource", (q) => q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId))
      .collect();
    return {
      shareLinks: links.map((l) => ({
        share_link_id: String(l._id),
        token: l.token,
        permission: l.permission,
      })),
    };
  },
});

export const resolveShareToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      found: v.literal(true),
      resourceType: v.string(),
      resourceId: v.string(),
      permission: v.string(),
    }),
    v.object({ found: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("shareLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!link) {
      return { found: false as const };
    }
    return {
      found: true as const,
      resourceType: link.resourceType,
      resourceId: link.resourceId,
      permission: link.permission,
    };
  },
});
