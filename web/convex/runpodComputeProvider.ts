import { ConvexError } from "convex/values";
import type {
  ComputeEndpointArgs,
  ComputeMachine,
  ComputeOffer,
  ComputeProvider,
  ComputeProviderContext,
  CreateMachineArgs,
  GetMachineArgs,
  TerminateMachineArgs,
} from "@convex/core/compute";
import {
  requireManagedRunpodApiKey,
  trimRunpodApiKeyOrThrow,
} from "@convex/runpodCredentialSecrets";

export type RunpodCloudType = "COMMUNITY" | "SECURE";

export type RunpodComputeProviderOptions = {
  resolveCloudType?: () => RunpodCloudType;
  resolveGpuPricePerHour?: (gpuType: string) => number | undefined;
  resolveCanonicalGpuName?: (runpodDisplayName: string) => string | undefined;
};

const DEFAULT_RUNPOD_CLOUD_TYPE: RunpodCloudType = "SECURE";

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

function runtimeEntrypoint() {
  return "/usr/local/bin/warden";
}

function normalizeGpuLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseJsonObject(rawText: string): Record<string, unknown> {
  try {
    const parsed = rawText ? JSON.parse(rawText) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function extractProviderCreationTime(body: Record<string, unknown>): number | undefined {
  const raw = body.createdAt;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw > 1e12 ? Math.floor(raw) : Math.floor(raw * 1000);
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  return undefined;
}

function requireRunpodMachineId(row: Record<string, unknown>, context: string) {
  const podId = typeof row.id === "string" ? row.id : (typeof row.podId === "string" ? row.podId : "");
  if (!podId) {
    throw new Error(`${context}: missing machine id in response`);
  }
  return podId;
}

function resolveRunpodCloudType(options: RunpodComputeProviderOptions) {
  return options.resolveCloudType?.() ?? DEFAULT_RUNPOD_CLOUD_TYPE;
}

function resolveRunpodGpuOfferPrice(
  options: RunpodComputeProviderOptions,
  gpu: RunpodGpuType,
) {
  if (!options.resolveGpuPricePerHour) {
    return undefined;
  }
  return options.resolveGpuPricePerHour(gpu.displayName || "") ?? options.resolveGpuPricePerHour(gpu.id || "");
}

function runpodRequestDetail(response: Response, rawText: string, body: Record<string, unknown>) {
  if (typeof body.message === "string") {
    return body.message;
  }
  if (typeof body.error === "string") {
    return body.error;
  }
  return rawText.trim() || `http ${response.status}`;
}

async function fetchRunpodGpuTypesByApiKey(apiKey: string) {
  const response = await fetch("https://api.runpod.io/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${trimRunpodApiKeyOrThrow(apiKey)}`,
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

  return Array.isArray(parsed?.data?.gpuTypes) ? parsed!.data!.gpuTypes! : [];
}

function resolveRunpodApiKey() {
  return requireManagedRunpodApiKey();
}

function toComputeOffers(
  gpuTypes: RunpodGpuType[],
  options: RunpodComputeProviderOptions,
): ComputeOffer[] {
  const offers = gpuTypes
    .filter((gpu) => gpu.id && gpu.id !== "unknown" && (gpu.secureCloud || gpu.communityCloud))
    .map((gpu) => ({
      id: gpu.id || "",
      displayName: (gpu.displayName ? options.resolveCanonicalGpuName?.(gpu.displayName) : undefined) ?? gpu.displayName ?? gpu.id ?? "",
      memoryInGb: Number.isFinite(gpu.memoryInGb) ? gpu.memoryInGb || 0 : 0,
      maxGpuCount: gpu.maxGpuCount || 1,
      pricePerHour: resolveRunpodGpuOfferPrice(options, gpu),
    }));

  offers.sort((a, b) => {
    if (b.memoryInGb !== a.memoryInGb) {
      return b.memoryInGb - a.memoryInGb;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  return offers;
}

async function resolveRunpodGpuTypeId(apiKey: string, requestedGpu: string, options: RunpodComputeProviderOptions = {}) {
  const trimmed = requestedGpu.trim();
  if (!trimmed) {
    throw new Error("GPU type is empty");
  }
  const gpuTypes = await fetchRunpodGpuTypesByApiKey(apiKey);
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

  // Try matching user's canonical name against RunPod display names via the adapter
  if (options.resolveCanonicalGpuName) {
    const canonicalMatch = gpuTypes.find((gpu) => {
      const canonical = options.resolveCanonicalGpuName!(gpu.displayName || "");
      return canonical && normalizeGpuLabel(canonical) === requestedNorm;
    });
    if (canonicalMatch?.id) {
      return canonicalMatch.id;
    }
  }

  const sample = gpuTypes
    .slice(0, 10)
    .map((gpu) => gpu.displayName || gpu.id || "")
    .filter(Boolean)
    .join(", ");
  throw new Error(`Runpod GPU type not found: "${trimmed}". Available examples: ${sample}`);
}

async function createRunpodMachine(
  _ctx: ComputeProviderContext,
  args: CreateMachineArgs,
  options: RunpodComputeProviderOptions,
) {
  const apiKey = resolveRunpodApiKey();
  const allowedCloudType = resolveRunpodCloudType(options);
  const gpuTypeId = await resolveRunpodGpuTypeId(apiKey, args.gpuType, options);

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
  const body = parseJsonObject(rawText);
  if (!response.ok) {
    throw new Error(`Runpod machine creation failed: ${runpodRequestDetail(response, rawText, body)}`);
  }
  return {
    providerMachineId: requireRunpodMachineId(body, "Runpod machine creation failed"),
    providerMetadata: body,
    _providerCreationTime: extractProviderCreationTime(body),
  };
}

async function getRunpodMachine(_ctx: ComputeProviderContext, args: GetMachineArgs): Promise<ComputeMachine | null> {
  const providerMachineId = args.providerMachineId.trim();
  if (!providerMachineId) {
    return null;
  }
  const apiKey = resolveRunpodApiKey();
  const response = await fetch(`https://rest.runpod.io/v1/pods/${providerMachineId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (response.status === 404) {
    return null;
  }
  const rawText = await response.text();
  const body = parseJsonObject(rawText);
  if (!response.ok) {
    throw new Error(`Runpod machine lookup failed: ${runpodRequestDetail(response, rawText, body)}`);
  }
  return {
    providerMachineId: requireRunpodMachineId(body, "Runpod machine lookup failed"),
    status: typeof body.status === "string" ? body.status : undefined,
    providerMetadata: body,
    _providerCreationTime: extractProviderCreationTime(body),
  };
}

async function terminateRunpodMachine(_ctx: ComputeProviderContext, args: TerminateMachineArgs) {
  const providerMachineId = args.providerMachineId.trim();
  if (!providerMachineId) {
    return;
  }
  const apiKey = resolveRunpodApiKey();
  const response = await fetch(`https://rest.runpod.io/v1/pods/${providerMachineId}`, {
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
    throw new Error(detail || `Runpod machine termination failed: http ${response.status}`);
  }
}

function buildRunpodProxyUrl(args: ComputeEndpointArgs) {
  const providerMachineId = args.providerMachineId.trim();
  const port = Number.isFinite(args.port) ? Math.trunc(args.port) : 0;
  if (!providerMachineId) {
    throw new Error("serve is missing a live inference runtime");
  }
  if (port <= 0) {
    throw new Error("serve is missing its inference port");
  }
  return `https://${providerMachineId}-${port}.proxy.runpod.net`;
}

export function resolveRunpodCompatibilityCloudType(options: RunpodComputeProviderOptions = {}) {
  return resolveRunpodCloudType(options);
}

export function createRunpodComputeProvider(options: RunpodComputeProviderOptions = {}): ComputeProvider {
  return {
    async listOffers() {
      const apiKey = resolveRunpodApiKey();
      return toComputeOffers(await fetchRunpodGpuTypesByApiKey(apiKey), options);
    },

    createMachine(ctx, args) {
      return createRunpodMachine(ctx, args, options);
    },
    getMachine: getRunpodMachine,
    terminateMachine: terminateRunpodMachine,
    resolveRuntimeEndpoint: buildRunpodProxyUrl,
    resolveIngressEndpoint: buildRunpodProxyUrl,
  };
}

export const runpodComputeProvider: ComputeProvider = createRunpodComputeProvider();
