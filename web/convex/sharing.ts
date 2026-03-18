import { ConvexError, v } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";

type ResourceType = "environment" | "run" | "data";
type Permission = "read" | "edit";

async function isOwner(ctx: QueryCtx, userId: string, resourceType: ResourceType, resourceId: string): Promise<boolean> {
  if (resourceType === "environment") {
    const env = await ctx.db.get(resourceId as Id<"environments">);
    return !!env && env.userId === userId;
  }
  if (resourceType === "run") {
    const run = await ctx.db.get(resourceId as Id<"runs">);
    return !!run && run.userId === userId;
  }
  if (resourceType === "data") {
    const blob = await ctx.db
      .query("dataBlobs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    return !!blob;
  }
  return false;
}

async function canAccess(
  ctx: QueryCtx,
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  requiredPermission: Permission,
): Promise<boolean> {
  if (await isOwner(ctx, userId, resourceType, resourceId)) {
    return true;
  }
  const shares = await ctx.db
    .query("shares")
    .withIndex("by_resource", (q) => q.eq("resourceType", resourceType).eq("resourceId", resourceId))
    .collect();
  for (const share of shares) {
    if (share.grantedToUserId !== userId) {
      continue;
    }
    if (requiredPermission === "read") {
      return true;
    }
    if (share.permission === "edit") {
      return true;
    }
  }
  return false;
}

export const internalCanAccess = internalQuery({
  args: {
    userId: v.string(),
    resourceType: v.union(v.literal("environment"), v.literal("run"), v.literal("data")),
    resourceId: v.string(),
    requiredPermission: v.union(v.literal("read"), v.literal("edit")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    return canAccess(ctx, args.userId, args.resourceType, args.resourceId, args.requiredPermission);
  },
});

async function createShareForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    resourceType: ResourceType;
    resourceId: string;
    grantedToUserId: string;
    permission: Permission;
  },
) {
  if (args.userId === args.grantedToUserId) {
    throw new ConvexError("cannot share a resource with yourself");
  }
  if (!(await isOwner(ctx, args.userId, args.resourceType, args.resourceId))) {
    throw new ConvexError("only the owner can share this resource");
  }
  const existing = await ctx.db
    .query("shares")
    .withIndex("by_resource", (q) => q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId))
    .collect();
  for (const share of existing) {
    if (share.grantedToUserId === args.grantedToUserId) {
      if (share.permission === args.permission) {
        return { share_id: String(share._id) };
      }
      await ctx.db.patch(share._id, { permission: args.permission });
      return { share_id: String(share._id) };
    }
  }
  const shareId = await ctx.db.insert("shares", {
    resourceType: args.resourceType,
    resourceId: args.resourceId,
    grantedToUserId: args.grantedToUserId,
    permission: args.permission,
    grantedByUserId: args.userId,
  });
  return { share_id: String(shareId) };
}

async function revokeShareForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    shareId: Id<"shares">;
  },
) {
  const share = await ctx.db.get(args.shareId);
  if (!share) {
    throw new ConvexError("share not found");
  }
  if (share.grantedByUserId !== args.userId) {
    const ownerCheck = await isOwner(ctx, args.userId, share.resourceType, share.resourceId);
    if (!ownerCheck) {
      throw new ConvexError("only the owner or grantor can revoke a share");
    }
  }
  await ctx.db.delete(args.shareId);
  return { revoked: true };
}

async function listSharedWithUser(ctx: QueryCtx, userId: string) {
  const shares = await ctx.db
    .query("shares")
    .withIndex("by_grantee", (q) => q.eq("grantedToUserId", userId))
    .collect();
  return {
    shares: shares.map((s) => ({
      share_id: String(s._id),
      resource_type: s.resourceType,
      resource_id: s.resourceId,
      permission: s.permission,
      granted_by: s.grantedByUserId,
    })),
  };
}

async function listSharedByUser(ctx: QueryCtx, userId: string) {
  const shares = await ctx.db
    .query("shares")
    .withIndex("by_grantor", (q) => q.eq("grantedByUserId", userId))
    .collect();
  return {
    shares: shares.map((s) => ({
      share_id: String(s._id),
      resource_type: s.resourceType,
      resource_id: s.resourceId,
      permission: s.permission,
      granted_to: s.grantedToUserId,
    })),
  };
}

const shareResponseValidator = v.object({ share_id: v.string() });
const revokeResponseValidator = v.object({ revoked: v.boolean() });
const sharedWithMeItemValidator = v.object({
  share_id: v.string(),
  resource_type: v.string(),
  resource_id: v.string(),
  permission: v.string(),
  granted_by: v.string(),
});
const sharedByMeItemValidator = v.object({
  share_id: v.string(),
  resource_type: v.string(),
  resource_id: v.string(),
  permission: v.string(),
  granted_to: v.string(),
});

export const createShare = mutation({
  args: {
    resourceType: v.union(v.literal("environment"), v.literal("run"), v.literal("data")),
    resourceId: v.string(),
    grantedToUserId: v.string(),
    permission: v.union(v.literal("read"), v.literal("edit")),
  },
  returns: shareResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return createShareForUserId(ctx, {
      userId: String(user._id),
      ...args,
    });
  },
});

export const revokeShare = mutation({
  args: { shareId: v.id("shares") },
  returns: revokeResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return revokeShareForUserId(ctx, {
      userId: String(user._id),
      shareId: args.shareId,
    });
  },
});

export const listSharedWithMe = query({
  args: {},
  returns: v.object({ shares: v.array(sharedWithMeItemValidator) }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listSharedWithUser(ctx, String(user._id));
  },
});

export const listSharedByMe = query({
  args: {},
  returns: v.object({ shares: v.array(sharedByMeItemValidator) }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listSharedByUser(ctx, String(user._id));
  },
});

export const listSharesForResource = query({
  args: {
    resourceType: v.union(v.literal("environment"), v.literal("run"), v.literal("data")),
    resourceId: v.string(),
  },
  returns: v.object({
    shares: v.array(
      v.object({
        share_id: v.string(),
        granted_to: v.string(),
        permission: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    if (!(await isOwner(ctx, userId, args.resourceType, args.resourceId))) {
      return { shares: [] };
    }
    const shares = await ctx.db
      .query("shares")
      .withIndex("by_resource", (q) => q.eq("resourceType", args.resourceType).eq("resourceId", args.resourceId))
      .collect();
    return {
      shares: shares.map((s) => ({
        share_id: String(s._id),
        granted_to: s.grantedToUserId,
        permission: s.permission,
      })),
    };
  },
});

export const internalCreateShare = internalMutation({
  args: {
    userId: v.string(),
    resourceType: v.union(v.literal("environment"), v.literal("run"), v.literal("data")),
    resourceId: v.string(),
    grantedToUserId: v.string(),
    permission: v.union(v.literal("read"), v.literal("edit")),
  },
  returns: shareResponseValidator,
  handler: async (ctx, args) => {
    return createShareForUserId(ctx, args);
  },
});

export const internalRevokeShare = internalMutation({
  args: {
    userId: v.string(),
    shareId: v.id("shares"),
  },
  returns: revokeResponseValidator,
  handler: async (ctx, args) => {
    return revokeShareForUserId(ctx, args);
  },
});
