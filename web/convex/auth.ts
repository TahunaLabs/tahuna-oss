import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { ConvexError, v } from "convex/values";
import { components, internal } from "@convex/_generated/api";
import type { DataModel } from "@convex/_generated/dataModel";
import { internalMutation, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import authConfig from "@convex/auth.config";
import { sha256Hex } from "@convex/crypto";
import { shortId } from "@convex/ids";
import { ensureUserLedger } from "@convex/credits";
import { sendOtpEmail } from "@convex/resend";
import { AUTH_CONFIG, BILLING_CONFIG, NETWORK_CONFIG } from "../config";

const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || NETWORK_CONFIG.defaultApiUrl;
const apiKeyListItemValidator = v.object({
  _id: v.id("apiKeys"),
  _creationTime: v.number(),
  name: v.string(),
  keyPrefix: v.string(),
  machineId: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("expired"), v.literal("revoked")),
  expiresAt: v.number(),
  lastUsedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
});

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: false,
      requireEmailVerification: false,
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ email, otp }) {
          await sendOtpEmail(ctx as MutationCtx, { email, otp });
        },
      }),
      convex({ authConfig }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

export const getMyCredits = query({
  args: {},
  returns: v.object({
    balance_cents: v.number(),
    currency: v.string(),
    initialized: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const userId = String(user._id);
    const row = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) {
      return {
        balance_cents: 0,
        currency: BILLING_CONFIG.currency,
        initialized: false,
      };
    }
    return {
      balance_cents: row.balanceCents,
      currency: row.currency || BILLING_CONFIG.currency,
      initialized: true,
    };
  },
});

export const listMyUsageEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      event_type: v.string(),
      credits_delta_cents: v.number(),
      balance_after_cents: v.number(),
      reference_type: v.union(v.string(), v.null()),
      reference_id: v.union(v.string(), v.null()),
      metadata: v.union(v.any(), v.null()),
      created_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const userId = String(user._id);
    const rawLimit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : 100;
    const limit = Math.max(1, Math.min(200, rawLimit));
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_user_and_created_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      event_type: row.eventType,
      credits_delta_cents: row.creditsDeltaCents,
      balance_after_cents: row.balanceAfterCents,
      reference_type: row.referenceType ?? null,
      reference_id: row.referenceId ?? null,
      metadata: row.metadata ?? null,
      created_at: row.createdAt,
    }));
  },
});

export const ensureMyLedger = mutation({
  args: {},
  returns: v.object({
    balance_cents: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await ensureUserLedger(ctx, {
      userId: String(user._id),
      source: "dashboard_bootstrap",
    });
    return {
      balance_cents: row.balanceCents,
      currency: row.currency,
    };
  },
});

export async function requireUser(ctx: GenericCtx<DataModel> | QueryCtx | MutationCtx | ActionCtx) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  const userId = String(user._id);

  if ("runMutation" in ctx && typeof ctx.runMutation === "function") {
    await ctx.runMutation(internal.credits.internalEnsureUserLedger, {
      userId,
      source: "auth_session",
    });
  } else if ("scheduler" in ctx) {
    await ensureUserLedger(ctx as MutationCtx, {
      userId,
      source: "auth_session",
    });
  }
  return user;
}

const MAX_ACTIVE_KEYS = AUTH_CONFIG.maxActiveKeys;
const KEY_EXPIRY_MS = AUTH_CONFIG.keyTtlDays * 24 * 60 * 60 * 1000;

export const createApiKey = mutation({
  args: {
    name: v.string(),
    machineId: v.optional(v.string()),
  },
  returns: v.object({
    user_id: v.string(),
    api_key: v.string(),
    api_key_id: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim() || "cli";
    const machineId = args.machineId?.trim() || undefined;
    const now = Date.now();
    const userId = String(user._id);

    // Fetch all keys for this user
    const allKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Active = not revoked AND not expired
    const activeKeys = allKeys.filter(
      (k) => !k.revokedAt && now - k._creationTime < KEY_EXPIRY_MS,
    );

    // Revoke any existing key on the same machine
    if (machineId) {
      for (const k of activeKeys) {
        if (k.machineId === machineId) {
          await ctx.db.patch(k._id, { revokedAt: now });
        }
      }
    }

    // Recount after machine revocation
    const stillActive = activeKeys.filter(
      (k) => !k.revokedAt && (machineId ? k.machineId !== machineId : true),
    );

    // Auto-revoke oldest if at or over limit
    if (stillActive.length >= MAX_ACTIVE_KEYS) {
      const sorted = [...stillActive].sort((a, b) => a._creationTime - b._creationTime);
      const toRevoke = sorted.slice(0, stillActive.length - MAX_ACTIVE_KEYS + 1);
      for (const k of toRevoke) {
        await ctx.db.patch(k._id, { revokedAt: now });
      }
    }

    const plaintext = `tk_${shortId()}${shortId()}`;
    const keyHash = await sha256Hex(plaintext);
    const keyPrefix = plaintext.slice(0, 10);

    const apiKeyId = await ctx.db.insert("apiKeys", {
      userId,
      name,
      keyPrefix,
      keyHash,
      machineId,
    });

    return {
      user_id: userId,
      api_key: plaintext,
      api_key_id: String(apiKeyId),
    };
  },
});

export const authByApiKey = query({
  args: { apiKey: v.string() },
  returns: v.union(v.object({ userId: v.string(), keyId: v.id("apiKeys"), lastUsedAt: v.optional(v.number()) }), v.null()),
  handler: async (ctx, args) => {
    const apiKey = args.apiKey.trim();
    if (!apiKey) {
      return null;
    }

    const keyHash = await sha256Hex(apiKey);
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
      .first();

    if (!key || key.revokedAt) {
      return null;
    }
    // 90-day expiry
    if (Date.now() - key._creationTime > KEY_EXPIRY_MS) {
      return null;
    }
    return {
      userId: key.userId,
      keyId: key._id,
      lastUsedAt: key.lastUsedAt,
    };
  },
});

export const internalTouchApiKeyLastUsed = internalMutation({
  args: {
    keyId: v.id("apiKeys"),
    at: v.optional(v.number()),
  },
  returns: v.object({
    touched: v.boolean(),
    lastUsedAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const key = await ctx.db.get("apiKeys", args.keyId);
    if (!key || key.revokedAt) {
      return { touched: false, lastUsedAt: undefined };
    }
    // Throttle writes to reduce contention during parallel sync requests.
    const now = typeof args.at === "number" && Number.isFinite(args.at) ? Math.floor(args.at) : Date.now();
    if (typeof key.lastUsedAt === "number" && now - key.lastUsedAt < 60_000) {
      return { touched: false, lastUsedAt: key.lastUsedAt };
    }
    await ctx.db.patch("apiKeys", args.keyId, { lastUsedAt: now });
    return { touched: true, lastUsedAt: now };
  },
});

export const listApiKeys = query({
  args: {},
  returns: v.array(apiKeyListItemValidator),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", String(user._id)))
      .order("desc")
      .collect();

    return keys.map((key) => {
      const expiresAt = key._creationTime + KEY_EXPIRY_MS;
      const status: "active" | "expired" | "revoked" =
        key.revokedAt ? "revoked" : now > expiresAt ? "expired" : "active";
      return {
        _id: key._id,
        _creationTime: key._creationTime,
        name: key.name,
        keyPrefix: key.keyPrefix,
        machineId: key.machineId,
        status,
        expiresAt,
        lastUsedAt: key.lastUsedAt,
        revokedAt: key.revokedAt,
      };
    });
  },
});

export const revokeApiKey = mutation({
  args: {
    id: v.id("apiKeys"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const key = await ctx.db.get("apiKeys", args.id);

    if (!key) throw new ConvexError("API key not found");
    if (key.userId !== String(user._id)) throw new ConvexError("Unauthorized");
    if (key.revokedAt) throw new ConvexError("API key already revoked");

    await ctx.db.patch("apiKeys", args.id, { revokedAt: Date.now() });
    return null;
  },
});
