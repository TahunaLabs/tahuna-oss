import { ConvexError } from "convex/values";
import { internal } from "@convex/_generated/api";
import type { ActionCtx } from "@convex/_generated/server";
import { decryptSecretValue } from "@convex/credentialsCrypto";

export function trimRunpodApiKeyOrThrow(value: string) {
  const apiKey = value.trim();
  if (!apiKey) {
    throw new ConvexError("Runpod API key is required");
  }
  return apiKey;
}

export async function decryptRunpodApiKey(row: {
  keyCiphertext: string;
  keyIv: string;
  keyVersion: number;
}) {
  return decryptSecretValue({
    ciphertext: row.keyCiphertext,
    iv: row.keyIv,
    version: row.keyVersion,
  });
}

export async function resolveActiveRunpodApiKeyForUserId(ctx: ActionCtx, userId: string) {
  const row = await ctx.runQuery(internal.runpodCredentialsStore.internalGetLatestActiveRunpodCredentialForUser, {
    userId,
  });
  if (!row) {
    throw new ConvexError("No compute provider configured. Add one in Settings → Providers.");
  }
  return {
    credentialId: row.credentialId,
    apiKey: await decryptRunpodApiKey(row),
  };
}

export async function resolveRunpodApiKeyByCredentialId(ctx: ActionCtx, credentialId: string) {
  const row = await ctx.runQuery(internal.runpodCredentialsStore.internalGetRunpodCredentialById, {
    credentialId,
  });
  if (!row) {
    throw new ConvexError("Runpod credential not found");
  }
  return {
    credentialId: row.credentialId,
    apiKey: await decryptRunpodApiKey(row),
    revokedAt: row.revokedAt,
  };
}
