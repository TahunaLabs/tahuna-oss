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

async function ensureUserByEmail(ctx: any, emailRaw: string) {
  const email = emailRaw.trim().toLowerCase();
  let user = await ctx.db
    .query("users")
    .withIndex("by_email", (q: any) => q.eq("email", email))
    .first();

  if (!user) {
    const id = await ctx.db.insert("users", {
      email,
      role: "member",
      orgId: "solo",
      createdAt: Date.now(),
    });
    user = await ctx.db.get(id);
  }

  if (!user) {
    throw new Error("failed to ensure user");
  }
  return user;
}

export const upsertUserByEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ensureUserByEmail(ctx, args.email);
    return {
      user_id: user._id,
      email: user.email,
      role: user.role,
      org_id: user.orgId,
    };
  },
});

export const createApiKey = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ensureUserByEmail(ctx, identity.email!);

    const plaintext = `tk_${shortId()}${shortId()}`;
    const keyHash = await sha256Hex(plaintext);
    const keyPrefix = plaintext.slice(0, 10);

    const apiKeyId = await ctx.db.insert("apiKeys", {
      userId: user._id,
      name: args.name.trim() || "cli",
      keyPrefix,
      keyHash,
      createdAt: Date.now(),
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
    const user = await ctx.db.get(key.userId);
    if (!user) {
      return null;
    }

    return {
      userId: key.userId,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    };
  },
});
