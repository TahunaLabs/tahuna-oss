export type SyncKind = "code" | "data";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// Global app config: committed to git and shared by web + convex code.
export const UPLOAD_LIMITS_BYTES = {
  codeBlob: 512 * MIB,
  dataBlob: 5 * GIB,
  codeManifest: 8 * MIB,
  dataManifest: 64 * MIB,
} as const;

export function blobLimitByKind(kind: SyncKind) {
  return kind === "data" ? UPLOAD_LIMITS_BYTES.dataBlob : UPLOAD_LIMITS_BYTES.codeBlob;
}

export function manifestLimitByKind(kind: SyncKind) {
  return kind === "data" ? UPLOAD_LIMITS_BYTES.dataManifest : UPLOAD_LIMITS_BYTES.codeManifest;
}
