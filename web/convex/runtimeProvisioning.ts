import type { Id } from "@convex/_generated/dataModel";
import type { ActionCtx } from "@convex/_generated/server";
import { images } from "@convex/catalog";
import { fetchRunpodGpuTypes, resolveRunpodApiKeyByCredentialId } from "@convex/runpodCredentials";
import { sha256Hex } from "@convex/syncManifest";
import { resolveRunpodCloudType } from "@/lib/runtime-incompatibility";

export function resolveImageName(framework: string, version: string, pythonVersion: string) {
  const frameworkImages = images[framework];
  if (!frameworkImages) {
    throw new Error(`unsupported framework for provisioning: ${framework}`);
  }
  const versionImages = frameworkImages[version];
  if (!versionImages) {
    throw new Error(`unsupported framework version for provisioning: ${framework}:${version}`);
  }
  const imageName = versionImages[pythonVersion];
  if (!imageName) {
    throw new Error(`unsupported python version for provisioning: ${framework}:${version}:${pythonVersion}`);
  }
  return imageName;
}

export function resolveRuntimeApiBase() {
  const candidates = [
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    process.env.SITE_URL,
  ];
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed && !trimmed.includes("localhost") && !trimmed.includes("127.0.0.1")) {
      return trimmed.replace(/\/+$/, "");
    }
  }
  for (const candidate of candidates) {
    const trimmed = (candidate || "").trim();
    if (trimmed) {
      return trimmed.replace(/\/+$/, "");
    }
  }
  throw new Error("SITE_URL is required for pod runtime callbacks");
}

export function resolveWandbBaseURL(runtimeApiBase: string) {
  return `${runtimeApiBase.replace(/\/+$/, "")}/api/monitoring/wandb`;
}

export function generateRuntimeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function runtimeEntrypoint() {
  return "/usr/local/bin/warden";
}

export type CreateRunpodPodArgs = {
  ctx: ActionCtx;
  name: string;
  runpodCredentialId: Id<"runpodCredentials">;
  imageName: string;
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
  env: Record<string, string>;
  ports?: string[];
};

type ProvisionRuntimePodArgs = {
  ctx: ActionCtx;
  shouldAbort: () => Promise<boolean>;
  setRuntimeTokenHash: (runtimeTokenHash: string) => Promise<void>;
  createPod: Omit<CreateRunpodPodArgs, "ctx" | "env">;
  buildEnv: (args: {
    runtimeToken: string;
    runtimeApiBase: string;
    runtimeRequestTimeoutSeconds: string;
  }) => Record<string, string>;
};

type TerminateRuntimePodWithRetryArgs = {
  ctx: ActionCtx;
  podId: string;
  runpodCredentialId?: Id<"runpodCredentials"> | null;
  attempt: number;
  shouldTerminate: () => Promise<boolean>;
  resolveCredentialId: () => Promise<Id<"runpodCredentials"> | null>;
  onTerminated: () => Promise<void>;
  onRetry: (args: {
    nextAttempt: number;
    runpodCredentialId?: Id<"runpodCredentials">;
    error: string;
  }) => Promise<void>;
};

function normalizeGpuLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveRunpodGpuTypeId(apiKey: string, requestedGpu: string) {
  const trimmed = requestedGpu.trim();
  if (!trimmed) {
    throw new Error("GPU type is empty");
  }
  const gpuTypes = await fetchRunpodGpuTypes(apiKey);
  if (gpuTypes.length === 0) {
    throw new Error("Runpod GPU catalog is empty");
  }

  const requestedNorm = normalizeGpuLabel(trimmed);
  const directMatch = gpuTypes.find((gpu) => typeof gpu.id === "string" && gpu.id === trimmed);
  if (directMatch?.id) {
    return directMatch.id;
  }
  const displayMatch = gpuTypes.find(
    (gpu) => typeof gpu.displayName === "string" && normalizeGpuLabel(gpu.displayName) === requestedNorm,
  );
  if (displayMatch?.id) {
    return displayMatch.id;
  }

  const sample = gpuTypes
    .slice(0, 10)
    .map((gpu) => gpu.displayName || gpu.id || "")
    .filter(Boolean)
    .join(", ");
  throw new Error(`Runpod GPU type not found: "${trimmed}". Available examples: ${sample}`);
}

export async function createRunpodPod(args: CreateRunpodPodArgs) {
  const { apiKey } = await resolveRunpodApiKeyByCredentialId(args.ctx, args.runpodCredentialId);
  const allowedCloudType = resolveRunpodCloudType();
  const gpuTypeId = await resolveRunpodGpuTypeId(apiKey, args.gpuType);

  const response = await fetch("https://rest.runpod.io/v1/pods", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: args.name,
      computeType: "GPU",
      cloudType: allowedCloudType,
      gpuCount: Math.max(1, args.gpuCount),
      gpuTypeIds: [gpuTypeId],
      gpuTypePriority: "custom",
      imageName: args.imageName,
      volumeInGb: Math.max(1, args.volumeGb),
      volumeMountPath: "/workspace",
      env: args.env,
      dockerEntrypoint: [runtimeEntrypoint()],
      ports: args.ports && args.ports.length > 0 ? args.ports : ["22/tcp", "8888/http"],
    }),
  });
  const rawText = await response.text();
  let body: unknown = null;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const bodyObj = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const detail =
      typeof bodyObj?.message === "string"
        ? bodyObj.message
        : typeof bodyObj?.error === "string"
          ? bodyObj.error
          : (rawText.trim() || `http ${response.status}`);
    throw new Error(`Runpod pod creation failed: ${detail}`);
  }
  const row = (body || {}) as Record<string, unknown>;
  const podId = typeof row.id === "string" ? row.id : (typeof row.podId === "string" ? row.podId : "");
  if (!podId) {
    throw new Error("Runpod pod creation failed: missing pod id in response");
  }
  return {
    podId,
    rawResponse: row,
  };
}

export async function provisionRuntimePod(args: ProvisionRuntimePodArgs) {
  const runtimeToken = generateRuntimeToken();
  const runtimeTokenHash = await sha256Hex(runtimeToken);
  await args.setRuntimeTokenHash(runtimeTokenHash);
  if (await args.shouldAbort()) {
    return null;
  }

  const runtimeApiBase = resolveRuntimeApiBase();
  const runtimeRequestTimeoutSeconds = process.env.TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS?.trim() || "120";
  return await createRunpodPod({
    ctx: args.ctx,
    ...args.createPod,
    env: args.buildEnv({
      runtimeToken,
      runtimeApiBase,
      runtimeRequestTimeoutSeconds,
    }),
  });
}

export async function terminateRunpodPod(
  ctx: ActionCtx,
  args: {
    podId: string;
    runpodCredentialId: Id<"runpodCredentials">;
  },
) {
  if (!args.podId) {
    return;
  }
  const { apiKey } = await resolveRunpodApiKeyByCredentialId(ctx, args.runpodCredentialId);
  const response = await fetch(`https://rest.runpod.io/v1/pods/${args.podId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (response.status === 404) {
    return;
  }
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail || `Runpod pod termination failed: http ${response.status}`);
  }
}

export async function terminateRuntimePodWithRetry(args: TerminateRuntimePodWithRetryArgs) {
  const shouldTerminate = await args.shouldTerminate();
  if (!shouldTerminate) {
    return;
  }

  let runpodCredentialId: Id<"runpodCredentials"> | null = args.runpodCredentialId ?? null;
  try {
    runpodCredentialId = runpodCredentialId ?? await args.resolveCredentialId();
    if (!runpodCredentialId) {
      throw new Error("Runpod credential is missing for pod termination");
    }
    await terminateRunpodPod(args.ctx, {
      podId: args.podId,
      runpodCredentialId,
    });
    await args.onTerminated();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "failed to terminate pod";
    const nextAttempt = args.attempt + 1;
    await args.onRetry({
      nextAttempt,
      runpodCredentialId: runpodCredentialId ?? undefined,
      error: detail,
    });
  }
}
