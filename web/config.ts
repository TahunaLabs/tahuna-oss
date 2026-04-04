export type SyncKind = "code" | "data";

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

// Global app config: committed to git and shared by web + convex code.
export const NETWORK_CONFIG = {
  defaultApiUrl: "http://localhost:3000",
  get siteUrl(): string {
    return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL)!.trim();
  },
} as const;

export const AUTH_CONFIG = {
  maxActiveKeys: 5,
  keyTtlDays: 90,
  loginTimeoutSeconds: 5 * 60,
} as const;

export const EMAIL_CONFIG = {
  otpFromEmail: {
    production: "hi@tahuna.app",
    nonProduction: "onboarding@resend.dev",
  },
} as const;

export const BILLING_CONFIG = {
  currency: "USD",
  initialCreditCents: 1000,
  computeVolumeGbHourlyRateCents: 2,
  unknownGpuPricePerHour: 1.39,
  storageGiBDeltaRateCents: 3,
  minimumChargeCents: 1,
} as const;

export const RUN_CONFIG = {
  statusPollSeconds: 5,
  logsPollSeconds: 2,
  startupTimeoutSeconds: 900,
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

const R2_ARTEFACTS_PATH = "/assets/artefacts";

export const CDN_CONFIG = {
  baseUrl: "https://pub-5f7c225fd68446a9b652150d7c7e52e9.r2.dev",
  providerIconsPath: "/assets/providers",
  frameworkIconsPath: "/assets/frameworks",
  faviconPath: "/assets/favicon",
  artefactsPath: R2_ARTEFACTS_PATH,
} as const;

export const LINKS_CONFIG = {
  docsUrl: "https://docs.tahuna.app",
  quickstartUrl: "https://docs.tahuna.app/quickstart",
  environmentsUrl: "https://docs.tahuna.app/environments",
  runsUrl: "https://docs.tahuna.app/runs",
  cliReferenceUrl: "https://docs.tahuna.app/cli",
  changelogUrl: "https://github.com/Pazuzzu/tahuna/releases",
  repoUrl: "https://github.com/Pazuzzu/tahuna",
  bugReportUrl: "https://insigh.to/b/tahuna/p/tahuna",
} as const;
