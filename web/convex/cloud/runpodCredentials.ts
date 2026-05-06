import { v } from "convex/values";
import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  action,
  mutation,
  query,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { encryptSecretValue } from "@convex/credentialsCrypto";
import {
  getLatestActiveRunpodCredentialForUserId,
  runpodCredentialStatusValidator,
  toRunpodCredentialStatus,
} from "@convex/runpodCredentialsStore";
import { validateRunpodApiKey } from "@convex/runpodComputeProvider";
import { trimRunpodApiKeyOrThrow } from "@convex/runpodCredentialSecrets";
import { sha256Hex } from "@convex/syncManifest";

type RunpodCredentialStatus = {
  configured: boolean;
  credential_id: Id<"runpodCredentials"> | null;
  key_prefix: string;
  validated_at?: number;
  updated_at?: number;
};

async function encryptRunpodApiKey(apiKey: string) {
  const encrypted = await encryptSecretValue(apiKey);
  return {
    keyCiphertext: encrypted.ciphertext,
    keyIv: encrypted.iv,
    keyVersion: encrypted.version,
  };
}

function keyPrefix(value: string) {
  return value.slice(0, 8);
}

export const getMyRunpodCredentialStatus = query({
  args: {},
  returns: runpodCredentialStatusValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await getLatestActiveRunpodCredentialForUserId(ctx, String(user._id));
    return toRunpodCredentialStatus(row);
  },
});

export const saveMyRunpodCredential = action({
  args: {
    api_key: v.string(),
  },
  returns: runpodCredentialStatusValidator,
  handler: async (ctx, args): Promise<RunpodCredentialStatus> => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const apiKey = trimRunpodApiKeyOrThrow(args.api_key);
    await validateRunpodApiKey(apiKey);
    const encrypted = await encryptRunpodApiKey(apiKey);
    const fingerprint = await sha256Hex(apiKey);
    return ctx.runMutation(internal.runpodCredentialsStore.internalReplaceActiveRunpodCredential, {
      userId,
      keyCiphertext: encrypted.keyCiphertext,
      keyIv: encrypted.keyIv,
      keyVersion: encrypted.keyVersion,
      keyPrefix: keyPrefix(apiKey),
      fingerprint,
      validatedAt: Date.now(),
    });
  },
});

export const revokeMyRunpodCredential = mutation({
  args: {},
  returns: runpodCredentialStatusValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const rows = await ctx.db
      .query("runpodCredentials")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const now = Date.now();
    for (const row of rows) {
      if (!row.revokedAt) {
        await ctx.db.patch(row._id, {
          revokedAt: now,
          updatedAt: now,
        });
      }
    }
    return toRunpodCredentialStatus(null);
  },
});
