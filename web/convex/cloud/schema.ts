import { defineTable } from "convex/server";
import { v } from "convex/values";

export const cloudRunBillingFields = {
  computeHourlyRateCents: v.optional(v.number()),
  creditsReservedCents: v.optional(v.number()),
  computeChargeCents: v.optional(v.number()),
  computeCollectedCents: v.optional(v.number()),
  computeOutstandingCents: v.optional(v.number()),
  computeChargeStatus: v.optional(
    v.union(v.literal("pending"), v.literal("charged"), v.literal("owed")),
  ),
  computeChargeError: v.optional(v.string()),
} as const;

export const cloudSchemaTables = {
  runpodCredentials: defineTable({
    userId: v.string(),
    keyCiphertext: v.string(),
    keyIv: v.string(),
    keyVersion: v.number(),
    keyPrefix: v.string(),
    fingerprint: v.string(),
    validatedAt: v.number(),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  userCredits: defineTable({
    userId: v.string(),
    balanceCents: v.number(),
    currency: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  usageEvents: defineTable({
    userId: v.string(),
    eventType: v.string(),
    creditsDeltaCents: v.number(),
    balanceAfterCents: v.number(),
    idempotencyKey: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_created_at", ["userId", "createdAt"])
    .index("by_user_and_idempotency_key", ["userId", "idempotencyKey"]),

  stripeCheckoutSessions: defineTable({
    userId: v.string(),
    amountCents: v.number(),
    creditsCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("open"),
      v.literal("paid"),
      v.literal("fulfilled"),
      v.literal("failed"),
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    fulfilledAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_created_at", ["userId", "createdAt"])
    .index("by_stripe_checkout_session_id", ["stripeCheckoutSessionId"]),
} as const;
