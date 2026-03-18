export type SyncKind = "code" | "data";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// Global app config: committed to git and shared by web + convex code.
export const NETWORK_CONFIG = {
  defaultApiUrl: "http://localhost:3000",
} as const;

export const AUTH_CONFIG = {
  maxActiveKeys: 5,
  keyTtlDays: 90,
  loginTimeoutSeconds: 5 * 60,
} as const;

export const BILLING_CONFIG = {
  currency: "EUR",
  initialCreditCents: 0,
  computeReservationHours: 1,
  computeGpuHourlyRateCents: 120,
  computeVolumeGbHourlyRateCents: 2,
  storageGiBDeltaRateCents: 3,
  minimumChargeCents: 1,
} as const;

export const RUN_CONFIG = {
  statusPollSeconds: 5,
  logsPollSeconds: 2,
  cancellationGraceSeconds: 30,
  terminationRetryMaxAttempts: 5,
  terminationRetryDelaySeconds: 10,
  runtimeLogTailLimit: 200,
  runtimeLogReactiveTailLimit: 50,
  runtimeLogStartupScanLimit: 200,
  runtimeLogReactiveStartupScanLimit: 80,
  runtimeLogPinnedBootstrapLimit: 40,
  runtimeMetricScanLimit: 3200,
  runtimeMetricSeriesLimit: 40,
  runtimeMetricPerSeriesLimit: 80,
  workpoolMaxParallelism: 3,
} as const;

export const SYNC_CONFIG = {
  commitRetryAttempts: 8,
  commitRetryReuploadAttempt: 4,
  commitRetryInitialBackoffMs: 250,
  commitRetryMaxBackoffMs: 2000,
  objectMetadataPollAttempts: 10,
  objectMetadataPollInitialBackoffMs: 150,
  objectMetadataPollMaxBackoffMs: 800,
} as const;

export const PYTHON_CONFIG = {
  defaultVersion: "3.11",
  supportedVersions: ["3.11", "3.12", "3.13", "3.14"],
} as const;

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
