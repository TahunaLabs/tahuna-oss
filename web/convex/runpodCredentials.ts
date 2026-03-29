import { ConvexError, v } from "convex/values";
import { internal } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  action,
  mutation,
  query,
  type ActionCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import {
  getLatestActiveRunpodCredentialForUserId,
  runpodCredentialStatusValidator,
  toRunpodCredentialStatus,
} from "@convex/runpodCredentialsStore";
import { sha256Hex } from "@convex/syncManifest";

const RUNPOD_CREDENTIAL_KEY_ENV_NAME = "TAHUNA_RUNPOD_CREDENTIALS_KEY";
const RUNPOD_CREDENTIAL_KEY_VERSION = 1;
const RUNPOD_CREDENTIAL_IV_BYTES = 12;

type RunpodGpuType = {
  id?: string;
  displayName?: string;
  memoryInGb?: number;
  maxGpuCount?: number | null;
  secureCloud?: Record<string, unknown> | null;
  communityCloud?: Record<string, unknown> | null;
};

type RunpodGraphqlResponse = {
  data?: {
    gpuTypes?: RunpodGpuType[];
  };
  errors?: Array<{ message?: string }> | unknown;
};

type RunpodCredentialStatus = {
  configured: boolean;
  credential_id: Id<"runpodCredentials"> | null;
  key_prefix: string;
  validated_at?: number;
  updated_at?: number;
};

function encodeBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }
  return btoa(value);
}

function decodeBase64(value: string) {
  try {
    const decoded = atob(value);
    const out = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) {
      out[index] = decoded.charCodeAt(index);
    }
    return out;
  } catch {
    throw new ConvexError(`invalid base64 value for ${RUNPOD_CREDENTIAL_KEY_ENV_NAME}`);
  }
}

let importedEncryptionKeyPromise: Promise<CryptoKey> | null = null;

async function getEncryptionKey() {
  if (!importedEncryptionKeyPromise) {
    importedEncryptionKeyPromise = (async () => {
      const rawKey = process.env[RUNPOD_CREDENTIAL_KEY_ENV_NAME]?.trim() || "";
      if (!rawKey) {
        throw new ConvexError(`${RUNPOD_CREDENTIAL_KEY_ENV_NAME} is not set`);
      }
      const keyBytes = decodeBase64(rawKey);
      if (keyBytes.byteLength !== 32) {
        throw new ConvexError(`${RUNPOD_CREDENTIAL_KEY_ENV_NAME} must decode to 32 bytes`);
      }
      return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
    })();
  }
  return importedEncryptionKeyPromise;
}

async function encryptRunpodApiKey(apiKey: string) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(RUNPOD_CREDENTIAL_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(apiKey),
  );
  return {
    keyCiphertext: encodeBase64(new Uint8Array(ciphertext)),
    keyIv: encodeBase64(iv),
    keyVersion: RUNPOD_CREDENTIAL_KEY_VERSION,
  };
}

async function decryptRunpodApiKey(row: {
  keyCiphertext: string;
  keyIv: string;
  keyVersion: number;
}) {
  if (row.keyVersion !== RUNPOD_CREDENTIAL_KEY_VERSION) {
    throw new ConvexError(`unsupported Runpod credential key version: ${row.keyVersion}`);
  }
  const key = await getEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(row.keyIv) },
    key,
    decodeBase64(row.keyCiphertext),
  );
  return new TextDecoder().decode(plaintext);
}

function trimApiKeyOrThrow(value: string) {
  const apiKey = value.trim();
  if (!apiKey) {
    throw new ConvexError("Runpod API key is required");
  }
  return apiKey;
}

function keyPrefix(value: string) {
  return value.slice(0, 8);
}

export async function fetchRunpodGpuTypes(apiKey: string) {
  const response = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${trimApiKeyOrThrow(apiKey)}`,
    },
    body: JSON.stringify({
      query: "query { gpuTypes { id displayName memoryInGb maxGpuCount secureCloud communityCloud } }",
    }),
  });

  const rawText = await response.text();
  let parsed: RunpodGraphqlResponse | null = null;
  try {
    parsed = rawText ? (JSON.parse(rawText) as RunpodGraphqlResponse) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = rawText.trim() || `http ${response.status}`;
    throw new ConvexError(`Runpod request failed: ${detail}`);
  }

  const errorMessage = Array.isArray(parsed?.errors)
    ? parsed?.errors.find((entry) => entry && typeof entry === "object" && typeof (entry as { message?: unknown }).message === "string")
    : null;
  if (errorMessage && typeof errorMessage === "object" && typeof errorMessage.message === "string") {
    throw new ConvexError(`Runpod request failed: ${errorMessage.message}`);
  }

  const gpuTypes = Array.isArray(parsed?.data?.gpuTypes) ? parsed!.data!.gpuTypes! : [];
  return gpuTypes;
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
    const apiKey = trimApiKeyOrThrow(args.api_key);
    await fetchRunpodGpuTypes(apiKey);
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

export async function resolveRunpodApiKeyByCredentialId(ctx: ActionCtx, credentialId: Id<"runpodCredentials">) {
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
