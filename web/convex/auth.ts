import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import authConfig from "./auth.config";
import { sha256Hex } from "./crypto";
import { shortId } from "./ids";

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
          const apiKey = process.env.RESEND_API_KEY?.trim() || "";
          const from = process.env.RESEND_FROM_EMAIL?.trim() || "";
          if (!apiKey || !from) {
            throw new Error("OTP delivery is not configured");
          }

          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: [email],
              subject: "Your Tahuna verification code",
              text: `Your Tahuna verification code is ${otp}. It expires in 10 minutes.`,
              html: `<p>Your Tahuna verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
            }),
          });

          if (!resp.ok) {
            const body = await resp.text();
            throw new Error(`failed to send otp email (${resp.status}): ${body}`);
          }
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



export const createApiKey = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
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
    const keyHash = await sha256Hex(args.apiKey.trim());
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", keyHash))
      .first();

    if (!key || key.revokedAt) {
      return null;
    }

    await ctx.db.patch(key._id, { lastUsedAt: Date.now() });
    // Because user is managed by BetterAuth component, we can't fetch it natively here easily.
    // Instead, BetterAuth `authByApiKey` might not return full user object natively without `authComponent`.
    // For now, we return basic fields. The CLI or API usage typically needs the userId.
    return {
      userId: key.userId,
      email: "api-user@tahuna.local", // We will refactor this depending on BetterAuth user querying if needed
      role: "member",
      orgId: "solo",
    };
  },
});

export const listApiKeys = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");

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
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const key = await ctx.db.get(args.id);

    if (!key) throw new Error("API key not found");
    if (key.userId !== String(user._id)) throw new Error("Unauthorized");
    if (key.revokedAt) throw new Error("API key already revoked");

    await ctx.db.patch(args.id, { revokedAt: Date.now() });
  },
});
