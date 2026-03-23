type RuntimeIncompatibilityPattern = {
  code: string;
  regex: RegExp;
  cooldownSeconds: number;
};

export type RuntimeCompatibilityFingerprint = {
  cloudType: "COMMUNITY" | "SECURE";
  framework: string;
  version: string;
  pythonVersion: string;
  gpuType: string;
  imageName: string;
};

const HARD_COOLDOWN_SECONDS = 24 * 60 * 60;
const SOFT_COOLDOWN_SECONDS = 60 * 60;

const PATTERNS: RuntimeIncompatibilityPattern[] = [
  {
    code: "cuda_driver_mismatch",
    regex: /(nvidia-container-cli|libcuda|cuda driver|driver version|failed to initialize nvml)/i,
    cooldownSeconds: HARD_COOLDOWN_SECONDS,
  },
  {
    code: "container_create_failed",
    regex: /(error creating container|container create:|failed to create shim task|exit status 1)/i,
    cooldownSeconds: HARD_COOLDOWN_SECONDS,
  },
  {
    code: "runtime_entrypoint_invalid",
    regex: /(executable file not found|no such file or directory|permission denied|exec format error)/i,
    cooldownSeconds: HARD_COOLDOWN_SECONDS,
  },
  {
    code: "missing_runtime_env",
    regex: /(missing required env vars|tahuna_run_id|tahuna_api_base|tahuna_runtime_token)/i,
    cooldownSeconds: HARD_COOLDOWN_SECONDS,
  },
  {
    code: "startup_timeout",
    regex: /(startup timeout|timed out waiting for runtime startup heartbeat)/i,
    cooldownSeconds: SOFT_COOLDOWN_SECONDS,
  },
];

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function resolveRunpodCloudType(): "COMMUNITY" | "SECURE" {
  const cloudType = process.env.RUNPOD_CLOUD_TYPE?.trim().toUpperCase() || "SECURE";
  return cloudType === "COMMUNITY" ? "COMMUNITY" : "SECURE";
}

export function buildRuntimeCompatibilityKey(fingerprint: RuntimeCompatibilityFingerprint) {
  return [
    normalizeToken(fingerprint.cloudType),
    normalizeToken(fingerprint.framework),
    normalizeToken(fingerprint.version),
    normalizeToken(fingerprint.pythonVersion),
    normalizeToken(fingerprint.gpuType),
    normalizeToken(fingerprint.imageName),
  ].join("|");
}

export function classifyRuntimeIncompatibility(detail: string): {
  code: string;
  cooldownSeconds: number;
} | null {
  const normalized = detail.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(normalized)) {
      return { code: pattern.code, cooldownSeconds: pattern.cooldownSeconds };
    }
  }
  return null;
}
