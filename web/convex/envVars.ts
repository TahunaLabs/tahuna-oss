import { ConvexError, v } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import { internal } from "@convex/_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "@convex/_generated/server";
import { decryptSecretValue, encryptSecretValue } from "@convex/credentialsCrypto";
import { getAccessibleEnvironment } from "@convex/runsAccess";

const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_ENV_VAR_NAMES = new Set(["PATH", "VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT"]);

type StoredEnvVar = {
  envVarId: Id<"envVars">;
  name: string;
  valueCiphertext: string;
  valueIv: string;
  valueVersion: number;
  updatedAt: number;
};

type EnvVarName = {
  name: string;
};

type EnvVarResponse = {
  name: string;
  value: string;
};

type EnvVarDeleteResponse = {
  deleted: boolean;
  name: string;
};

const envVarNameValidator = v.object({
  name: v.string(),
});

const envVarInputValidator = v.object({
  name: v.string(),
  value: v.string(),
});

const envVarNamesValidator = v.array(envVarNameValidator);

const storedEnvVarValidator = v.object({
  envVarId: v.id("envVars"),
  name: v.string(),
  valueCiphertext: v.string(),
  valueIv: v.string(),
  valueVersion: v.number(),
  updatedAt: v.number(),
});

const storedEnvVarOrNullValidator = v.union(v.null(), storedEnvVarValidator);
const storedEnvVarsValidator = v.array(storedEnvVarValidator);

export const envVarResponseValidator = v.object({
  name: v.string(),
  value: v.string(),
});

export const envVarDeleteResponseValidator = v.object({
  deleted: v.boolean(),
  name: v.string(),
});

export function isReservedEnvVarName(name: string) {
  return name.startsWith("TAHUNA_") || RESERVED_ENV_VAR_NAMES.has(name);
}

export function shouldInjectEnvironmentEnvVar(name: string) {
  const normalized = name.trim();
  return normalized !== "" && ENV_VAR_NAME_PATTERN.test(normalized) && !isReservedEnvVarName(normalized);
}

export function normalizeEnvVarNameOrThrow(value: string) {
  const name = value.trim();
  if (!name) {
    throw new ConvexError("env var name is required");
  }
  if (!ENV_VAR_NAME_PATTERN.test(name)) {
    throw new ConvexError("env var name must match [A-Za-z_][A-Za-z0-9_]*");
  }
  if (isReservedEnvVarName(name)) {
    throw new ConvexError(`${name} is reserved and managed by Tahuna`);
  }
  return name;
}

function toStoredEnvVar(row: {
  _id: Id<"envVars">;
  name: string;
  valueCiphertext: string;
  valueIv: string;
  valueVersion: number;
  updatedAt: number;
}): StoredEnvVar {
  return {
    envVarId: row._id,
    name: row.name,
    valueCiphertext: row.valueCiphertext,
    valueIv: row.valueIv,
    valueVersion: row.valueVersion,
    updatedAt: row.updatedAt,
  };
}

async function getStoredEnvVarByName(
  ctx: QueryCtx | MutationCtx,
  environmentId: Id<"environments">,
  name: string,
) {
  const row = await ctx.db
    .query("envVars")
    .withIndex("by_environment_and_name", (q) => q.eq("environmentId", environmentId).eq("name", name))
    .unique();
  return row ? toStoredEnvVar(row) : null;
}

async function listStoredEnvVarsForEnvironment(
  ctx: QueryCtx | MutationCtx,
  environmentId: Id<"environments">,
) {
  const rows = await ctx.db
    .query("envVars")
    .withIndex("by_environment", (q) => q.eq("environmentId", environmentId))
    .collect();
  return rows
    .map(toStoredEnvVar)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listInjectableEnvVarNames(rows: Array<{ name: string }>): EnvVarName[] {
  return rows
    .filter(({ name }) => shouldInjectEnvironmentEnvVar(name))
    .map(({ name }) => ({ name }));
}

async function assertEnvironmentAccess(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
  requiredPermission: "read" | "edit",
) {
  await getAccessibleEnvironment(ctx, userId, environmentId, requiredPermission);
}

export async function resolveEnvironmentEnvVarsForEnvironmentId(
  ctx: ActionCtx,
  environmentId: Id<"environments">,
) {
  const rows = await ctx.runQuery(internal.envVars.internalListStoredEnvironmentEnvVars, {
    environmentId,
  });
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (!shouldInjectEnvironmentEnvVar(row.name)) {
      continue;
    }
    out[row.name] = await decryptSecretValue({
      ciphertext: row.valueCiphertext,
      iv: row.valueIv,
      version: row.valueVersion,
    });
  }
  return out;
}

export function buildProvisionedRuntimeEnv(args: {
  defaultEnv?: Record<string, string>;
  environmentEnv: Record<string, string>;
  systemEnv: Record<string, string>;
}) {
  const injectedDefaultEnv: Record<string, string> = {};
  for (const [name, value] of Object.entries(args.defaultEnv || {})) {
    if (!shouldInjectEnvironmentEnvVar(name)) {
      continue;
    }
    injectedDefaultEnv[name] = value;
  }
  const injectedEnvironmentEnv: Record<string, string> = {};
  for (const [name, value] of Object.entries(args.environmentEnv)) {
    if (!shouldInjectEnvironmentEnvVar(name)) {
      continue;
    }
    injectedEnvironmentEnv[name] = value;
  }
  return {
    ...injectedDefaultEnv,
    ...injectedEnvironmentEnv,
    ...args.systemEnv,
  };
}

export const internalAssertEnvironmentAccess = internalQuery({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    requiredPermission: v.union(v.literal("read"), v.literal("edit")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertEnvironmentAccess(ctx, args.userId, args.environmentId, args.requiredPermission);
    return null;
  },
});

export const internalListStoredEnvironmentEnvVars = internalQuery({
  args: {
    environmentId: v.id("environments"),
  },
  returns: storedEnvVarsValidator,
  handler: async (ctx, args) => {
    return listStoredEnvVarsForEnvironment(ctx, args.environmentId);
  },
});

export const internalListEnvironmentEnvVarNames = internalQuery({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
  },
  returns: envVarNamesValidator,
  handler: async (ctx, args) => {
    await assertEnvironmentAccess(ctx, args.userId, args.environmentId, "read");
    return listInjectableEnvVarNames(await listStoredEnvVarsForEnvironment(ctx, args.environmentId));
  },
});

export const internalGetStoredEnvironmentEnvVar = internalQuery({
  args: {
    environmentId: v.id("environments"),
    name: v.string(),
  },
  returns: storedEnvVarOrNullValidator,
  handler: async (ctx, args) => {
    return getStoredEnvVarByName(ctx, args.environmentId, args.name);
  },
});

export const internalGetEnvironmentEnvVar = internalQuery({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    name: v.string(),
  },
  returns: envVarResponseValidator,
  handler: async (ctx, args): Promise<EnvVarResponse> => {
    const name = normalizeEnvVarNameOrThrow(args.name);
    await assertEnvironmentAccess(ctx, args.userId, args.environmentId, "read");
    const row = await getStoredEnvVarByName(ctx, args.environmentId, name);
    if (!row || !shouldInjectEnvironmentEnvVar(row.name)) {
      throw new ConvexError("env var not found");
    }
    return {
      name: row.name,
      value: await decryptSecretValue({
        ciphertext: row.valueCiphertext,
        iv: row.valueIv,
        version: row.valueVersion,
      }),
    };
  },
});

export const internalUpsertStoredEnvironmentEnvVar = internalMutation({
  args: {
    environmentId: v.id("environments"),
    name: v.string(),
    valueCiphertext: v.string(),
    valueIv: v.string(),
    valueVersion: v.number(),
  },
  returns: envVarNameValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await getStoredEnvVarByName(ctx, args.environmentId, args.name);
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
      environmentId: args.environmentId,
      name: args.name,
      valueCiphertext: args.valueCiphertext,
      valueIv: args.valueIv,
      valueVersion: args.valueVersion,
      updatedAt: now,
    });
    return { name: args.name };
  },
});

export const internalSetEnvironmentEnvVars = internalAction({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    envVars: v.array(envVarInputValidator),
  },
  returns: envVarNamesValidator,
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.envVars.internalAssertEnvironmentAccess, {
      userId: args.userId,
      environmentId: args.environmentId,
      requiredPermission: "edit",
    });

    const deduped = new Map<string, string>();
    for (const row of args.envVars) {
      deduped.set(normalizeEnvVarNameOrThrow(row.name), row.value);
    }

    const updatedNames: EnvVarName[] = [];
    for (const [name, value] of deduped.entries()) {
      const encrypted = await encryptSecretValue(value);
      updatedNames.push(await ctx.runMutation(internal.envVars.internalUpsertStoredEnvironmentEnvVar, {
        environmentId: args.environmentId,
        name,
        valueCiphertext: encrypted.ciphertext,
        valueIv: encrypted.iv,
        valueVersion: encrypted.version,
      }));
    }
    return updatedNames.sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const internalDeleteEnvironmentEnvVar = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    name: v.string(),
  },
  returns: envVarDeleteResponseValidator,
  handler: async (ctx, args): Promise<EnvVarDeleteResponse> => {
    const name = normalizeEnvVarNameOrThrow(args.name);
    await assertEnvironmentAccess(ctx, args.userId, args.environmentId, "edit");
    const existing = await getStoredEnvVarByName(ctx, args.environmentId, name);
    if (!existing) {
      throw new ConvexError("env var not found");
    }
    await ctx.db.delete(existing.envVarId);
    return {
      deleted: true,
      name,
    };
  },
});
