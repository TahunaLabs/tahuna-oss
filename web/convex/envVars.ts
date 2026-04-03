import { ConvexError, v } from "convex/values";
import { internal } from "@convex/_generated/api";
import { action, query, type ActionCtx } from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { decryptSecretValue, encryptSecretValue } from "@convex/credentialsCrypto";
import {
  envVarNameValidator,
  envVarNamesValidator,
  listEnvVarNamesForUserId,
} from "@convex/envVarsStore";

const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED_ENV_VAR_NAMES = new Set(["PATH", "VIRTUAL_ENV", "UV_PROJECT_ENVIRONMENT"]);

type EnvVarName = {
  name: string;
};

type EnvVarResponse = {
  name: string;
  value: string;
};

type EnvVarListResponse = {
  env_vars: EnvVarName[];
};

type EnvVarDeleteResponse = {
  deleted: boolean;
  name: string;
};

export const envVarResponseValidator = v.object({
  name: v.string(),
  value: v.string(),
});

export const envVarListResponseValidator = v.object({
  env_vars: envVarNamesValidator,
});

export const envVarDeleteResponseValidator = v.object({
  deleted: v.boolean(),
  name: v.string(),
});

export function normalizeEnvVarNameOrThrow(value: string) {
  const name = value.trim();
  if (!name) {
    throw new ConvexError("env var name is required");
  }
  if (!ENV_VAR_NAME_PATTERN.test(name)) {
    throw new ConvexError("env var name must match [A-Za-z_][A-Za-z0-9_]*");
  }
  if (name.startsWith("TAHUNA_") || RESERVED_ENV_VAR_NAMES.has(name)) {
    throw new ConvexError(`${name} is reserved and managed by Tahuna`);
  }
  return name;
}

function toEnvVarListResponse(names: EnvVarName[]): EnvVarListResponse {
  return { env_vars: names };
}

export async function resolveUserEnvVarsForUserId(ctx: ActionCtx, userId: string) {
  const rows = await ctx.runQuery(internal.envVarsStore.internalListEnvVarsForUser, {
    userId,
  });
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.name] = await decryptSecretValue({
      ciphertext: row.valueCiphertext,
      iv: row.valueIv,
      version: row.valueVersion,
    });
  }
  return out;
}

export function buildProvisionedRuntimeEnv(args: {
  userEnv: Record<string, string>;
  defaultEnv?: Record<string, string>;
  systemEnv: Record<string, string>;
}) {
  return {
    ...(args.defaultEnv || {}),
    ...args.userEnv,
    ...args.systemEnv,
  };
}

export const listMyEnvVars = query({
  args: {},
  returns: envVarListResponseValidator,
  handler: async (ctx): Promise<EnvVarListResponse> => {
    const user = await requireUser(ctx);
    const names = await listEnvVarNamesForUserId(ctx, String(user._id));
    return toEnvVarListResponse(names);
  },
});

export const getMyEnvVar = action({
  args: {
    name: v.string(),
  },
  returns: envVarResponseValidator,
  handler: async (ctx, args): Promise<EnvVarResponse> => {
    const user = await requireUser(ctx);
    const name = normalizeEnvVarNameOrThrow(args.name);
    const row = await ctx.runQuery(internal.envVarsStore.internalGetEnvVarForUser, {
      userId: String(user._id),
      name,
    }) as {
      valueCiphertext: string;
      valueIv: string;
      valueVersion: number;
    } | null;
    if (!row) {
      throw new ConvexError("env var not found");
    }
    return {
      name,
      value: await decryptSecretValue({
        ciphertext: row.valueCiphertext,
        iv: row.valueIv,
        version: row.valueVersion,
      }),
    };
  },
});

export const setMyEnvVar = action({
  args: {
    name: v.string(),
    value: v.string(),
  },
  returns: envVarNameValidator,
  handler: async (ctx, args): Promise<EnvVarName> => {
    const user = await requireUser(ctx);
    const name = normalizeEnvVarNameOrThrow(args.name);
    const encrypted = await encryptSecretValue(args.value);
    return ctx.runMutation(internal.envVarsStore.internalUpsertEnvVarForUser, {
      userId: String(user._id),
      name,
      valueCiphertext: encrypted.ciphertext,
      valueIv: encrypted.iv,
      valueVersion: encrypted.version,
    });
  },
});

export const deleteMyEnvVar = action({
  args: {
    name: v.string(),
  },
  returns: envVarDeleteResponseValidator,
  handler: async (ctx, args): Promise<EnvVarDeleteResponse> => {
    const user = await requireUser(ctx);
    const name = normalizeEnvVarNameOrThrow(args.name);
    const deleted = await ctx.runMutation(internal.envVarsStore.internalDeleteEnvVarForUser, {
      userId: String(user._id),
      name,
    }) as boolean;
    if (!deleted) {
      throw new ConvexError("env var not found");
    }
    return {
      deleted,
      name,
    };
  },
});
