import { v } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "@convex/_generated/server";

export const runpodCredentialStatusValidator = v.object({
  configured: v.boolean(),
  credential_id: v.union(v.id("runpodCredentials"), v.null()),
  key_prefix: v.string(),
  fingerprint: v.string(),
  validated_at: v.optional(v.number()),
  updated_at: v.optional(v.number()),
});

export const runpodCredentialEnvelopeValidator = v.union(
  v.null(),
  v.object({
    credentialId: v.id("runpodCredentials"),
    keyCiphertext: v.string(),
    keyIv: v.string(),
    keyVersion: v.number(),
    keyPrefix: v.string(),
    fingerprint: v.string(),
    validatedAt: v.number(),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }),
);

export function toRunpodCredentialStatus(row: {
  credentialId: Id<"runpodCredentials">;
  keyPrefix: string;
  fingerprint: string;
  validatedAt: number;
  updatedAt: number;
} | null) {
  if (!row) {
    return {
      configured: false,
      credential_id: null,
      key_prefix: "",
      fingerprint: "",
    };
  }
  return {
    configured: true,
    credential_id: row.credentialId,
    key_prefix: row.keyPrefix,
    fingerprint: row.fingerprint,
    validated_at: row.validatedAt,
    updated_at: row.updatedAt,
  };
}

export async function getLatestActiveRunpodCredentialForUserId(ctx: QueryCtx | MutationCtx, userId: string) {
  const rows = await ctx.db
    .query("runpodCredentials")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
  const row = rows.find((entry) => !entry.revokedAt);
  if (!row) {
    return null;
  }
  return {
    credentialId: row._id,
    keyCiphertext: row.keyCiphertext,
    keyIv: row.keyIv,
    keyVersion: row.keyVersion,
    keyPrefix: row.keyPrefix,
    fingerprint: row.fingerprint,
    validatedAt: row.validatedAt,
    revokedAt: row.revokedAt,
    updatedAt: row.updatedAt,
  };
}

async function getRunpodCredentialById(ctx: QueryCtx | MutationCtx, credentialId: Id<"runpodCredentials">) {
  const row = await ctx.db.get(credentialId);
  if (!row) {
    return null;
  }
  return {
    credentialId: row._id,
    keyCiphertext: row.keyCiphertext,
    keyIv: row.keyIv,
    keyVersion: row.keyVersion,
    keyPrefix: row.keyPrefix,
    fingerprint: row.fingerprint,
    validatedAt: row.validatedAt,
    revokedAt: row.revokedAt,
    updatedAt: row.updatedAt,
  };
}

export const internalGetLatestActiveRunpodCredentialForUser = internalQuery({
  args: {
    userId: v.string(),
  },
  returns: runpodCredentialEnvelopeValidator,
  handler: async (ctx, args) => {
    return getLatestActiveRunpodCredentialForUserId(ctx, args.userId);
  },
});

export const internalGetRunpodCredentialById = internalQuery({
  args: {
    credentialId: v.id("runpodCredentials"),
  },
  returns: runpodCredentialEnvelopeValidator,
  handler: async (ctx, args) => {
    return getRunpodCredentialById(ctx, args.credentialId);
  },
});

export const internalReplaceActiveRunpodCredential = internalMutation({
  args: {
    userId: v.string(),
    keyCiphertext: v.string(),
    keyIv: v.string(),
    keyVersion: v.number(),
    keyPrefix: v.string(),
    fingerprint: v.string(),
    validatedAt: v.number(),
  },
  returns: runpodCredentialStatusValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("runpodCredentials")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of rows) {
      if (!row.revokedAt) {
        await ctx.db.patch(row._id, {
          revokedAt: now,
          updatedAt: now,
        });
      }
    }

    const credentialId = await ctx.db.insert("runpodCredentials", {
      userId: args.userId,
      keyCiphertext: args.keyCiphertext,
      keyIv: args.keyIv,
      keyVersion: args.keyVersion,
      keyPrefix: args.keyPrefix,
      fingerprint: args.fingerprint,
      validatedAt: args.validatedAt,
      updatedAt: now,
    });

    return toRunpodCredentialStatus({
      credentialId,
      keyPrefix: args.keyPrefix,
      fingerprint: args.fingerprint,
      validatedAt: args.validatedAt,
      updatedAt: now,
    });
  },
});
