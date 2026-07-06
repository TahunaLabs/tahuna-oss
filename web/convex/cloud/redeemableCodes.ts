import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { grantUserCredits, USAGE_EVENT_TYPE } from "@convex/cloud/credits";
import { CLOUD_BILLING_CONFIG, REDEEMABLE_CODE_CONFIG } from "@/cloud/config";

function normalizeCode(raw: string) {
  const code = raw.trim().toUpperCase();
  if (!code) {
    throw new ConvexError("code is required");
  }
  return code;
}

function normalizeAmountCents(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError("amount_cents must be a positive number");
  }
  return Math.floor(value);
}

function normalizeCreatedBy(value: string) {
  const createdBy = value.trim().toLowerCase();
  if (!createdBy) {
    throw new ConvexError("created_by is required");
  }
  const isAuthorized = REDEEMABLE_CODE_CONFIG.authorizedCreatorEmails.some(
    (email) => email.toLowerCase() === createdBy,
  );
  if (!isAuthorized) {
    throw new ConvexError("created_by must be an authorized founder email");
  }
  return createdBy;
}

function normalizeMaxRedemptions(value: number | undefined) {
  if (value === undefined) {
    return REDEEMABLE_CODE_CONFIG.defaultMaxRedemptions;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new ConvexError("max_redemptions must be a non-negative number");
  }
  return Math.floor(value);
}

export const internalCreateReferralCode = internalMutation({
  args: {
    code: v.optional(v.string()),
    amount_cents: v.number(),
    max_redemptions: v.optional(v.number()),
    expires_at: v.number(),
    created_by: v.string(),
  },
  returns: v.object({ code: v.string() }),
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code ?? crypto.randomUUID().slice(0, 8));
    const amountCents = normalizeAmountCents(args.amount_cents);
    const createdBy = normalizeCreatedBy(args.created_by);
    const maxRedemptions = normalizeMaxRedemptions(args.max_redemptions);
    const existing = await ctx.db
      .query("redeemableCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (existing) {
      throw new ConvexError("code already exists");
    }

    await ctx.db.insert("redeemableCodes", {
      code,
      kind: "referral",
      amountCents,
      currency: CLOUD_BILLING_CONFIG.currency,
      maxRedemptions,
      redemptionCount: 0,
      active: true,
      createdBy,
      expiresAt: args.expires_at,
      updatedAt: Date.now(),
    });
    return { code };
  },
});

export const internalUpsertPromoCode = internalMutation({
  args: {
    code: v.string(),
    amount_cents: v.number(),
    max_user_count: v.optional(v.number()),
    expires_at: v.number(),
    created_by: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const code = normalizeCode(args.code);
    const amountCents = normalizeAmountCents(args.amount_cents);
    const createdBy = normalizeCreatedBy(args.created_by);
    const maxRedemptions = normalizeMaxRedemptions(args.max_user_count);
    const existing = await ctx.db
      .query("redeemableCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        amountCents,
        maxRedemptions,
        active: true,
        createdBy,
        expiresAt: args.expires_at,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("redeemableCodes", {
        code,
        kind: "promo",
        amountCents,
        currency: CLOUD_BILLING_CONFIG.currency,
        maxRedemptions,
        redemptionCount: 0,
        active: true,
        createdBy,
        expiresAt: args.expires_at,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const redeemCode = mutation({
  args: { code: v.string() },
  returns: v.object({
    balance_cents: v.number(),
    currency: v.string(),
    amount_cents_granted: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const code = normalizeCode(args.code);

    const row = await ctx.db
      .query("redeemableCodes")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!row || !row.active) {
      throw new ConvexError("invalid code");
    }
    if (row.expiresAt < Date.now()) {
      throw new ConvexError("code has expired");
    }
    if (row.redemptionCount >= row.maxRedemptions) {
      throw new ConvexError("code redemption limit reached");
    }

    const eventType =
      row.kind === "promo" ? USAGE_EVENT_TYPE.PROMO_CODE_REDEMPTION : USAGE_EVENT_TYPE.REFERRAL_CODE_REDEMPTION;

    const result = await grantUserCredits(ctx, {
      userId,
      amountCents: row.amountCents,
      eventType,
      idempotencyKey: `redeem:${row._id}:${userId}`,
      referenceType: "redeemable_code",
      referenceId: String(row._id),
      metadata: { code: row.code },
    });
    if (!result) {
      throw new ConvexError("unable to redeem code");
    }
    if (!result.applied) {
      throw new ConvexError("code already redeemed");
    }

    await ctx.db.patch(row._id, {
      redemptionCount: row.redemptionCount + 1,
      updatedAt: Date.now(),
    });

    return {
      balance_cents: result.balanceCents,
      currency: row.currency,
      amount_cents_granted: row.amountCents,
    };
  },
});
