const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;

export type SyncKind = "code" | "data";

export type ManifestEntry = {
  path: string;
  sha256: string;
  size: number;
  mode: number;
};

export type SyncManifestPayload = {
  version: number;
  type: SyncKind;
  created_at: number;
  entries: ManifestEntry[];
};

type ParseManifestOptions = {
  maxEntrySizeBytes?: number;
};

export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(hash)) return null;
  return hash;
}

export function parseManifestEntry(value: unknown): ManifestEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const path = typeof row.path === "string" ? row.path.trim() : "";
  const sha256 = normalizeSha256(row.sha256);
  const size = typeof row.size === "number" ? row.size : NaN;
  const mode = typeof row.mode === "number" ? row.mode : NaN;
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) {
    return null;
  }
  if (path === "." || path === ".." || path.includes("/../") || path.startsWith("../")) {
    return null;
  }
  if (!sha256 || !Number.isFinite(size) || size < 0 || !Number.isInteger(size)) {
    return null;
  }
  if (!Number.isFinite(mode) || mode < 0 || mode > 0o777 || !Number.isInteger(mode)) {
    return null;
  }
  return { path, sha256, size, mode };
}

export function parseManifest(
  value: unknown,
  kind: SyncKind,
  options?: ParseManifestOptions,
): SyncManifestPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const version = row.version;
  const type = row.type;
  const createdAt = row.created_at;
  const entries = row.entries;
  if (version !== 1 || type !== kind || typeof createdAt !== "number" || !Number.isFinite(createdAt)) {
    return null;
  }
  if (!Array.isArray(entries)) {
    return null;
  }
  const parsedEntries: ManifestEntry[] = [];
  let previousPath = "";
  for (const entry of entries) {
    const parsed = parseManifestEntry(entry);
    if (!parsed) {
      return null;
    }
    if (previousPath !== "" && parsed.path < previousPath) {
      return null;
    }
    if (typeof options?.maxEntrySizeBytes === "number" && parsed.size > options.maxEntrySizeBytes) {
      return null;
    }
    previousPath = parsed.path;
    parsedEntries.push(parsed);
  }
  return {
    version: 1,
    type: kind,
    created_at: createdAt,
    entries: parsedEntries,
  };
}

export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
