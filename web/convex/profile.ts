import { ConvexError, v } from "convex/values";
import { mutation, query } from "@convex/_generated/server";
import { authComponent, requireUser } from "@convex/auth";

const userProfileValidator = v.object({
  first_name: v.string(),
  last_name: v.string(),
  address_line_1: v.string(),
  address_line_2: v.string(),
  country: v.string(),
  company_name: v.string(),
  company_id: v.string(),
  tax_id: v.string(),
  updated_at: v.optional(v.number()),
});

export const getMyProfile = query({
  args: {},
  returns: userProfileValidator,
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const row = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", String(user._id)))
      .first();
    return {
      first_name: row?.firstName ?? "",
      last_name: row?.lastName ?? "",
      address_line_1: row?.addressLine1 ?? "",
      address_line_2: row?.addressLine2 ?? "",
      country: row?.country ?? "",
      company_name: row?.companyName ?? "",
      company_id: row?.companyId ?? "",
      tax_id: row?.taxId ?? "",
      updated_at: row?.updatedAt,
    };
  },
});

export const saveMyProfile = mutation({
  args: {
    first_name: v.string(),
    last_name: v.string(),
    address_line_1: v.string(),
    address_line_2: v.string(),
    country: v.string(),
    company_name: v.string(),
    company_id: v.string(),
    tax_id: v.string(),
  },
  returns: userProfileValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const now = Date.now();
    const payload = {
      firstName: args.first_name.trim(),
      lastName: args.last_name.trim(),
      addressLine1: args.address_line_1.trim(),
      addressLine2: args.address_line_2.trim(),
      country: args.country.trim(),
      companyName: args.company_name.trim(),
      companyId: args.company_id.trim(),
      taxId: args.tax_id.trim(),
      updatedAt: now,
    };
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("userProfiles", {
        userId,
        ...payload,
        createdAt: now,
      });
    }

    return {
      first_name: payload.firstName,
      last_name: payload.lastName,
      address_line_1: payload.addressLine1,
      address_line_2: payload.addressLine2,
      country: payload.country,
      company_name: payload.companyName,
      company_id: payload.companyId,
      tax_id: payload.taxId,
      updated_at: now,
    };
  },
});
