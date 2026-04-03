import type { Id } from "@convex/_generated/dataModel";
import { httpAction, internalQuery, type ActionCtx } from "@convex/_generated/server";
import { v } from "convex/values";
import { blobLimitByKind, manifestLimitByKind } from "@convex/appConfig";
import {
  buildBlobObjectKey,
  buildManifestObjectKey,
  authenticateApiRequest,
  corsHeaders,
  objectExistsWithMetadataSync,
  parseSizeBytes,
  parseSyncKind,
  r2,
  readJsonBody,
  requireAccessibleEnvironment,
  toClientErrorDetail,
} from "@convex/cli/shared";
import { internal } from "@convex/_generated/api";
import {
  normalizeSha256,
  parseManifest,
  sha256Hex,
  type SyncKind,
  type SyncManifestPayload,
} from "@convex/syncManifest";

export const internalGetObjectDownloadUrl = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const metadata = await r2.getMetadata(ctx, args.key);
    return metadata?.url ?? null;
  },
});

async function fetchManifestFromR2(
  _ctx: ActionCtx,
  key: string,
  kind: SyncKind,
  expectedHash: string,
): Promise<SyncManifestPayload> {
  const url = await r2.getUrl(key);
  const response = await fetch(url, { method: "GET" });
  if (response.status === 404) {
    throw new Error(`${kind} manifest not found in object storage`);
  }
  if (!response.ok) {
    throw new Error(`${kind} manifest download failed with status ${response.status}`);
  }
  const rawText = await response.text();
  const computedHash = await sha256Hex(rawText);
  if (computedHash !== expectedHash) {
    throw new Error(`${kind} manifest hash mismatch`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`${kind} manifest is not valid JSON`);
  }
  const manifest = parseManifest(parsed, kind, {
    maxEntrySizeBytes: blobLimitByKind(kind),
  });
  if (!manifest) {
    throw new Error(`${kind} manifest payload is invalid`);
  }
  return manifest;
}

function normalizeServeSnapshot(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const snapshot = raw as Record<string, unknown>;
  const command = Array.isArray(snapshot.command)
    ? snapshot.command.filter((part): part is string => typeof part === "string" && part.trim() !== "")
    : null;
  const pythonVersion = typeof snapshot.python_version === "string" ? snapshot.python_version.trim() : "";
  const gpuType = typeof snapshot.gpu_type === "string" ? snapshot.gpu_type.trim() : "";
  const gpuCount = typeof snapshot.gpu_count === "number" ? snapshot.gpu_count : null;
  const volumeGb = typeof snapshot.volume_gb === "number" ? snapshot.volume_gb : null;
  const port = typeof snapshot.port === "number" ? snapshot.port : null;
  const healthPath = typeof snapshot.health_path === "string" ? snapshot.health_path.trim() : "";
  const defaultModelPath = typeof snapshot.default_model_path === "string" ? snapshot.default_model_path.trim() : "";
  const startupTimeoutSeconds =
    typeof snapshot.startup_timeout_seconds === "number" ? snapshot.startup_timeout_seconds : null;
  const healthIntervalSeconds =
    typeof snapshot.health_interval_seconds === "number" ? snapshot.health_interval_seconds : null;
  const healthTimeoutSeconds =
    typeof snapshot.health_timeout_seconds === "number" ? snapshot.health_timeout_seconds : null;
  const healthFailureThreshold =
    typeof snapshot.health_failure_threshold === "number" ? snapshot.health_failure_threshold : null;
  const gracefulShutdownSeconds =
    typeof snapshot.graceful_shutdown_seconds === "number" ? snapshot.graceful_shutdown_seconds : null;
  const dependencyGroup =
    typeof snapshot.dependency_group === "string" ? snapshot.dependency_group.trim() : undefined;

  if (
    !command || command.length === 0 ||
    !pythonVersion ||
    !gpuType ||
    gpuCount === null || gpuCount < 1 ||
    volumeGb === null || volumeGb < 1 ||
    port === null || port < 1 || port > 65535 ||
    !healthPath || !healthPath.startsWith("/") ||
    !defaultModelPath ||
    startupTimeoutSeconds === null || startupTimeoutSeconds < 1 ||
    healthIntervalSeconds === null || healthIntervalSeconds < 1 ||
    healthTimeoutSeconds === null || healthTimeoutSeconds < 1 ||
    healthFailureThreshold === null || healthFailureThreshold < 1 ||
    gracefulShutdownSeconds === null || gracefulShutdownSeconds < 1
  ) {
    throw new Error("serve_snapshot must include command, runtime, device, port, health, and model fields");
  }
  return {
    command,
    dependency_group: dependencyGroup,
    python_version: pythonVersion,
    gpu_type: gpuType,
    gpu_count: gpuCount,
    volume_gb: volumeGb,
    port,
    health_path: healthPath,
    default_model_path: defaultModelPath,
    startup_timeout_seconds: startupTimeoutSeconds,
    health_interval_seconds: healthIntervalSeconds,
    health_timeout_seconds: healthTimeoutSeconds,
    health_failure_threshold: healthFailureThreshold,
    graceful_shutdown_seconds: gracefulShutdownSeconds,
  };
}

export const listMissingBlobHashes = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const ownedEnvironment = await requireAccessibleEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const kind = parseSyncKind(body?.kind);
  if (!kind) {
    return new Response(JSON.stringify({ detail: "kind must be one of: code, data" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (!Array.isArray(body?.hashes)) {
    return new Response(JSON.stringify({ detail: "hashes must be an array" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const seen = new Set<string>();
  const hashes: string[] = [];
  for (const rawHash of body.hashes) {
    const hash = normalizeSha256(rawHash);
    if (!hash) {
      return new Response(JSON.stringify({ detail: "hashes must contain valid sha256 hex values" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    if (!seen.has(hash)) {
      seen.add(hash);
      hashes.push(hash);
    }
  }

  const missingSet = new Set<string>();
  const maxConcurrency = 24;
  let cursor = 0;
  const workers = Math.min(maxConcurrency, Math.max(1, hashes.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= hashes.length) {
          return;
        }
        const hash = hashes[index];
        const key = buildBlobObjectKey(hash);
        const exists = await objectExistsWithMetadataSync(ctx, key, 2);
        if (!exists) {
          missingSet.add(hash);
        }
      }
    }),
  );
  const missing = hashes.filter((hash) => missingSet.has(hash));

  return new Response(JSON.stringify({ missing }), {
    status: 200,
    headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
  });
});

export const createBlobUploadUrl = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const ownedEnvironment = await requireAccessibleEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const kind = parseSyncKind(body?.kind);
  if (!kind) {
    return new Response(JSON.stringify({ detail: "kind must be one of: code, data" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const sha256 = normalizeSha256(body?.sha256);
  if (!sha256) {
    return new Response(JSON.stringify({ detail: "sha256 must be a valid sha256 hex value" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const sizeBytes = parseSizeBytes(body?.size_bytes);
  if (sizeBytes === null) {
    return new Response(JSON.stringify({ detail: "size_bytes must be a positive integer" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const maxSizeBytes = blobLimitByKind(kind);
  if (sizeBytes > maxSizeBytes) {
    return new Response(JSON.stringify({ detail: `${kind} blob exceeds limit of ${maxSizeBytes} bytes` }), {
      status: 413,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const key = buildBlobObjectKey(sha256);
    const upload = await r2.generateUploadUrl(key);
    return new Response(
      JSON.stringify({
        key: upload.key,
        url: upload.url,
        environment_id: environmentId,
        data_id: ownedEnvironment.dataId,
      }),
      {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      },
    );
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to generate blob upload URL");
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const createManifestUploadUrl = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const ownedEnvironment = await requireAccessibleEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const kind = parseSyncKind(body?.kind);
  if (!kind) {
    return new Response(JSON.stringify({ detail: "kind must be one of: code, data" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const manifestHash = normalizeSha256(body?.manifest_hash);
  if (!manifestHash) {
    return new Response(JSON.stringify({ detail: "manifest_hash must be a valid sha256 hex value" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const sizeBytes = parseSizeBytes(body?.size_bytes);
  if (sizeBytes === null) {
    return new Response(JSON.stringify({ detail: "size_bytes must be a positive integer" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
  const maxSizeBytes = manifestLimitByKind(kind);
  if (sizeBytes > maxSizeBytes) {
    return new Response(JSON.stringify({ detail: `${kind} manifest exceeds limit of ${maxSizeBytes} bytes` }), {
      status: 413,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  try {
    const key = buildManifestObjectKey(environmentId, ownedEnvironment.dataId, kind, manifestHash);
    const upload = await r2.generateUploadUrl(key);
    return new Response(
      JSON.stringify({
        key: upload.key,
        url: upload.url,
        environment_id: environmentId,
        data_id: ownedEnvironment.dataId,
      }),
      {
        status: 200,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      },
    );
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to generate manifest upload URL");
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});

export const commitSync = httpAction(async (ctx, request) => {
  const userId = await authenticateApiRequest(ctx, request);
  if (!userId) {
    return new Response(JSON.stringify({ detail: "authentication required" }), {
      status: 401,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const body = await readJsonBody(request);
  const environmentId = typeof body?.environment_id === "string" ? body.environment_id.trim() : "";
  if (!environmentId) {
    return new Response(JSON.stringify({ detail: "environment_id is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const codeManifestHashRaw =
    typeof body?.code_manifest_hash === "string" ? body.code_manifest_hash : undefined;
  const dataManifestHashRaw =
    typeof body?.data_manifest_hash === "string" ? body.data_manifest_hash : undefined;
  // Legacy payload keys (`code_manifest`, `data_manifest`) are tolerated
  // but no longer required. Validation now uses uploaded manifest objects.
  const codeManifestHash =
    typeof codeManifestHashRaw === "undefined" ? undefined : (normalizeSha256(codeManifestHashRaw) ?? undefined);
  const dataManifestHash =
    typeof dataManifestHashRaw === "undefined" ? undefined : (normalizeSha256(dataManifestHashRaw) ?? undefined);

  if (
    (typeof codeManifestHashRaw !== "undefined" && !codeManifestHash) ||
    (typeof dataManifestHashRaw !== "undefined" && !dataManifestHash)
  ) {
    return new Response(JSON.stringify({ detail: "manifest hashes must be valid sha256 hex values" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const typedEnvironmentId = environmentId as Id<"environments">;
  const ownedEnvironment = await requireAccessibleEnvironment(ctx, userId, environmentId);
  if (!ownedEnvironment) {
    return new Response(JSON.stringify({ detail: "environment not found" }), {
      status: 404,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  if (codeManifestHash) {
    const codeManifestKey = buildManifestObjectKey(
      environmentId,
      ownedEnvironment.dataId,
      "code",
      codeManifestHash,
    );
    const exists = await objectExistsWithMetadataSync(ctx, codeManifestKey);
    if (!exists) {
      return new Response(JSON.stringify({ detail: "code manifest not found in object storage" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    try {
      await fetchManifestFromR2(ctx, codeManifestKey, "code", codeManifestHash);
    } catch (err) {
      const detail = toClientErrorDetail(err, "code manifest validation failed");
      return new Response(JSON.stringify({ detail }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }
  if (dataManifestHash) {
    const dataManifestKey = buildManifestObjectKey(
      environmentId,
      ownedEnvironment.dataId,
      "data",
      dataManifestHash,
    );
    const exists = await objectExistsWithMetadataSync(ctx, dataManifestKey);
    if (!exists) {
      return new Response(JSON.stringify({ detail: "data manifest not found in object storage" }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
    try {
      await fetchManifestFromR2(ctx, dataManifestKey, "data", dataManifestHash);
    } catch (err) {
      const detail = toClientErrorDetail(err, "data manifest validation failed");
      return new Response(JSON.stringify({ detail }), {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      });
    }
  }

  const framework =
    typeof body?.framework === "string" && body.framework.trim() !== "" ? body.framework.trim() : undefined;
  const version =
    typeof body?.version === "string" && body.version.trim() !== "" ? body.version.trim() : undefined;
  const pythonVersion =
    typeof body?.python_version === "string" && body.python_version.trim() !== ""
      ? body.python_version.trim()
      : undefined;
  const gpuType =
    typeof body?.gpu_type === "string" && body.gpu_type.trim() !== "" ? body.gpu_type.trim() : undefined;
  const gpuCount = typeof body?.gpu_count === "number" && body.gpu_count > 0 ? body.gpu_count : undefined;
  const volumeGb = typeof body?.volume_gb === "number" && body.volume_gb > 0 ? body.volume_gb : undefined;
  const commandRaw = body?.command;
  const command = Array.isArray(commandRaw)
    ? commandRaw.filter((p: unknown) => typeof p === "string" && (p as string).trim() !== "")
    : undefined;
  const trainDependencyGroup =
    typeof body?.train_dependency_group === "string"
      ? body.train_dependency_group.trim()
      : undefined;
  const outputDir = typeof body?.output_dir === "string" && body.output_dir.trim() !== ""
    ? body.output_dir.trim()
    : undefined;
  let serveSnapshot;
  try {
    serveSnapshot = normalizeServeSnapshot(body?.serve_snapshot);
  } catch (err) {
    const detail = toClientErrorDetail(err, "invalid serve snapshot");
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }

  const hasConfigUpdate =
    typeof framework !== "undefined" ||
    typeof version !== "undefined" ||
    typeof pythonVersion !== "undefined" ||
    typeof gpuType !== "undefined" ||
    typeof gpuCount !== "undefined" ||
    typeof volumeGb !== "undefined" ||
    typeof command !== "undefined" ||
    typeof trainDependencyGroup !== "undefined" ||
    typeof outputDir !== "undefined" ||
    typeof serveSnapshot !== "undefined";

  if (!codeManifestHash && !dataManifestHash && !hasConfigUpdate) {
    return new Response(
      JSON.stringify({ detail: "at least one manifest hash or synced config field is required" }),
      {
        status: 400,
        headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
      },
    );
  }

  try {
    const data = await ctx.runMutation(internal.environments.internalCommitSync, {
      userId,
      environmentId: typedEnvironmentId,
      code_manifest_hash: codeManifestHash,
      data_manifest_hash: dataManifestHash,
      framework,
      version,
      python_version: pythonVersion,
      gpu_type: gpuType,
      gpu_count: gpuCount,
      volume_gb: volumeGb,
      command,
      train_dependency_group: trainDependencyGroup,
      output_dir: outputDir,
      serve_snapshot: serveSnapshot,
    });
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  } catch (err) {
    const detail = toClientErrorDetail(err, "failed to commit sync");
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json", ...corsHeaders() }),
    });
  }
});
