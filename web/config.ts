export type SyncKind = "code" | "data";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
// Global app config: committed to git and shared by web + convex code.
export const NETWORK_CONFIG = {
  get siteUrl(): string {
    const url = process.env.NEXT_PUBLIC_SITE_URL;
    if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is required");
    return url;
  },
} as const;

export const AUTH_CONFIG = {
  maxActiveKeys: 5,
  keyTtlDays: 90,
  loginTimeoutSeconds: 5 * 60,
} as const;

export const BILLING_CONFIG = {
  currency: "USD",
  initialCreditCents: 0,
  computeVolumeGbMonthlyRateCents: 12,
  minimumChargeCents: 1,
} as const;

export const RUNPOD_CONFIG = {
  defaultCloudType: "SECURE" as "COMMUNITY" | "SECURE",
} as const;

export const RUN_CONFIG = {
  statusPollSeconds: 5,
  logsPollSeconds: 2,
  startupTimeoutSeconds: 900,
  cancellationGraceSeconds: 30,
  computeSessionDefaultIdleTimeoutSeconds: 10 * 60,
  computeSessionMaxIdleTimeoutSeconds: 60 * 60,
  computeSessionHeartbeatTimeoutSeconds: 2 * 60,
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

export const INFERENCE_PROXY_CONFIG = {
  maxRequestBytes: 10 * MIB,
  upstreamTimeoutMs: 120 * 1000,
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

export const CDN_CONFIG = {
  get baseUrl(): string {
    const url = process.env.NEXT_PUBLIC_CDN_BASE_URL;
    if (!url) throw new Error("NEXT_PUBLIC_CDN_BASE_URL is required");
    return url;
  },
  providerIconsPath: "/assets/providers",
  frameworkIconsPath: "/assets/frameworks",
  faviconPath: "/assets/favicon",
  artefactsPath: "/assets/artefacts",
  heroGradientLight: "tahuna-hero-gradient-teal-lime.avif",
  heroGradientDark: "tahuna-hero-gradient-dark-teal-lime.avif",
} as const;
