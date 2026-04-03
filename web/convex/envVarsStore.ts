import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "@convex/_generated/server";

export const envVarNameValidator = v.object({
  name: v.string(),
});

export const envVarNamesValidator = v.array(envVarNameValidator);

export const envVarEnvelopeValidator = v.union(
  v.null(),
  v.object({
    envVarId: v.id("envVars"),
    name: v.string(),
    valueCiphertext: v.string(),
    valueIv: v.string(),
    valueVersion: v.number(),
    updatedAt: v.number(),
  }),
);

export const envVarEnvelopesValidator = v.array(
  v.object({
    envVarId: v.id("envVars"),
    name: v.string(),
    valueCiphertext: v.string(),
    valueIv: v.string(),
    valueVersion: v.number(),
    updatedAt: v.number(),
  }),
);

async function getEnvVarByName(ctx: QueryCtx | MutationCtx, userId: string, name: string) {
  const row = await ctx.db
    .query("envVars")
    .withIndex("by_user_and_name", (q) => q.eq("userId", userId).eq("name", name))
    .unique();
  if (!row) {
    return null;
  }
  return {
    envVarId: row._id,
    name: row.name,
    valueCiphertext: row.valueCiphertext,
    valueIv: row.valueIv,
    valueVersion: row.valueVersion,
    updatedAt: row.updatedAt,
  };
}

export async function listEnvVarNamesForUserId(ctx: QueryCtx | MutationCtx, userId: string) {
  const rows = await ctx.db
    .query("envVars")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows
    .map((row) => ({ name: row.name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export const internalListEnvVarNamesForUser = internalQuery({
  args: {
    userId: v.string(),
  },
  returns: envVarNamesValidator,
  handler: async (ctx, args) => {
    return listEnvVarNamesForUserId(ctx, args.userId);
  },
});

export const internalListEnvVarsForUser = internalQuery({
  args: {
    userId: v.string(),
  },
  returns: envVarEnvelopesValidator,
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("envVars")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows
      .map((row) => ({
        envVarId: row._id,
        name: row.name,
        valueCiphertext: row.valueCiphertext,
        valueIv: row.valueIv,
        valueVersion: row.valueVersion,
        updatedAt: row.updatedAt,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const internalGetEnvVarForUser = internalQuery({
  args: {
    userId: v.string(),
    name: v.string(),
  },
  returns: envVarEnvelopeValidator,
  handler: async (ctx, args) => {
    return getEnvVarByName(ctx, args.userId, args.name);
  },
});

export const internalUpsertEnvVarForUser = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    valueCiphertext: v.string(),
    valueIv: v.string(),
    valueVersion: v.number(),
  },
  returns: envVarNameValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await getEnvVarByName(ctx, args.userId, args.name);
    if (existing) {
      await ctx.db.patch(existing.envVarId, {
        valueCiphertext: args.valueCiphertext,
        valueIv: args.valueIv,
        valueVersion: args.valueVersion,
        updatedAt: now,
      });
      return { name: args.name };
    }

    await ctx.db.insert("envVars", {
      userId: args.userId,
      name: args.name,
      valueCiphertext: args.valueCiphertext,
      valueIv: args.valueIv,
      valueVersion: args.valueVersion,
      updatedAt: now,
    });
    return { name: args.name };
  },
});

export const internalDeleteEnvVarForUser = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await getEnvVarByName(ctx, args.userId, args.name);
    if (!existing) {
      return false;
    }
    await ctx.db.delete(existing.envVarId);
    return true;
  },
});
