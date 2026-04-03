import { ConvexError } from "convex/values";

export const CREDENTIALS_SECRET_ENV_NAME = "TAHUNA_CREDENTIALS_SECRET";

const CREDENTIALS_KEY_VERSION = 1;
const CREDENTIALS_IV_BYTES = 12;

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
    throw new ConvexError(`invalid base64 value for ${CREDENTIALS_SECRET_ENV_NAME}`);
  }
}

let importedEncryptionKeyPromise: Promise<CryptoKey> | null = null;

async function getEncryptionKey() {
  if (!importedEncryptionKeyPromise) {
    importedEncryptionKeyPromise = (async () => {
      const rawKey = process.env[CREDENTIALS_SECRET_ENV_NAME]?.trim() || "";
      if (!rawKey) {
        throw new ConvexError(`${CREDENTIALS_SECRET_ENV_NAME} is not set`);
      }
      const keyBytes = decodeBase64(rawKey);
      if (keyBytes.byteLength !== 32) {
        throw new ConvexError(`${CREDENTIALS_SECRET_ENV_NAME} must decode to 32 bytes`);
      }
      return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
    })();
  }
  return importedEncryptionKeyPromise;
}

export async function encryptSecretValue(value: string) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(CREDENTIALS_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return {
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    iv: encodeBase64(iv),
    version: CREDENTIALS_KEY_VERSION,
  };
}

export async function decryptSecretValue(row: {
  ciphertext: string;
  iv: string;
  version: number;
}) {
  if (row.version !== CREDENTIALS_KEY_VERSION) {
    throw new ConvexError(`unsupported credentials key version: ${row.version}`);
  }
  const key = await getEncryptionKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(row.iv) },
    key,
    decodeBase64(row.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
