import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { v } from "convex/values";
import { components } from "@convex/_generated/api";
import type { DataModel } from "@convex/_generated/dataModel";
import { mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "@convex/_generated/server";
import authConfig from "@convex/auth.config";
import { sha256Hex } from "@convex/crypto";
import { shortId } from "@convex/ids";
import { sendOtpEmail } from "@convex/resend";

const siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

export async function requireUser(ctx: GenericCtx<DataModel> | QueryCtx | MutationCtx | ActionCtx) {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

export const createApiKey = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim() || "cli";

    const existingKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", String(user._id)))
      .filter((q) => q.eq(q.field("name"), name))
      .collect();

    const hasActiveKey = existingKeys.some((k) => !k.revokedAt);
    if (hasActiveKey) {
      throw new Error(`An active API key with the name "${name}" already exists`);
    }

    const plaintext = `tk_${shortId()}${shortId()}`;
    const keyHash = await sha256Hex(plaintext);
    const keyPrefix = plaintext.slice(0, 10);

    const apiKeyId = await ctx.db.insert("apiKeys", {
      userId: String(user._id),
      name,
      keyPrefix,
      keyHash,
    });

    return {
      user_id: String(user._id),
      api_key: plaintext,
      api_key_id: String(apiKeyId),
    };
  },
});

export const authByApiKey = mutation({
  args: { apiKey: v.string() },
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

    await ctx.db.patch(key._id, { lastUsedAt: Date.now() });
    return {
      userId: key.userId,
    };
  },
});

export const listApiKeys = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_user", (q) => q.eq("userId", String(user._id)))
      .order("desc")
      .collect();

    return keys.map((key) => ({
      _id: key._id,
      _creationTime: key._creationTime,
      name: key.name,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    }));
  },
});

export const revokeApiKey = mutation({
  args: {
    id: v.id("apiKeys"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const key = await ctx.db.get(args.id);

    if (!key) throw new Error("API key not found");
    if (key.userId !== String(user._id)) throw new Error("Unauthorized");
    if (key.revokedAt) throw new Error("API key already revoked");

    await ctx.db.patch(args.id, { revokedAt: Date.now() });
  },
});
