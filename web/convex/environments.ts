import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { components, internal } from "@convex/_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "@convex/_generated/server";
import { requireUser } from "@convex/auth";
import { images } from "@convex/catalog";
import { shortId } from "@convex/ids";
import { R2 } from "@convex-dev/r2";
import { PYTHON_CONFIG } from "@convex/appConfig";
import { ENVIRONMENT_CONFIG_FILE_NAME, parseEnvironmentConfig, renderEnvironmentConfig } from "@/lib/environment-config";

const serveSnapshotResponseValidator = v.object({
  command: v.array(v.string()),
  python_version: v.string(),
  gpu_type: v.string(),
  gpu_count: v.number(),
  volume_gb: v.number(),
  port: v.number(),
  health_path: v.string(),
  default_model_path: v.string(),
  startup_timeout_seconds: v.number(),
  health_interval_seconds: v.number(),
  health_timeout_seconds: v.number(),
  health_failure_threshold: v.number(),
  graceful_shutdown_seconds: v.number(),
});

const environmentResponseValidator = v.object({
  environment_id: v.string(),
  data_id: v.string(),
  access: v.union(v.literal("private"), v.literal("shared")),
  created_at: v.number(),
  last_updated_at: v.number(),
  latest_data_manifest_hash: v.union(v.string(), v.null()),
  bound_data_ids: v.array(v.string()),
  bound_data_manifest_hashes: v.array(v.string()),
  name: v.string(),
  artifacts: v.string(),
  gpu_type: v.string(),
  gpu_count: v.number(),
  volume_gb: v.number(),
  python_version: v.string(),
  framework: v.string(),
  version: v.string(),
  command: v.array(v.string()),
  output_dir: v.string(),
  serve_snapshot: v.union(serveSnapshotResponseValidator, v.null()),
});

const listEnvironmentsResponseValidator = v.object({
  environments: v.array(environmentResponseValidator),
});
const environmentConfigResponseValidator = v.object({
  environment: environmentResponseValidator,
  config_name: v.string(),
  config_text: v.string(),
});
const commitSyncPointersResponseValidator = v.object({
  ok: v.boolean(),
  environment_id: v.string(),
  code_manifest_hash: v.optional(v.string()),
  data_manifest_hash: v.optional(v.string()),
});
const SHA256_HEX_RE = /^[a-f0-9]{64}$/i;
const manifestRefValidator = v.object({
  kind: v.union(v.literal("code"), v.literal("data")),
  manifestHash: v.string(),
  environmentId: v.string(),
  dataId: v.string(),
});

type ManifestKind = "code" | "data";
type ManifestRef = {
  kind: ManifestKind;
  manifestHash: string;
  environmentId: string;
  dataId: string;
};

const r2 = new R2(components.r2);
const RUN_CLEANUP_QUERY_BATCH_SIZE = 12;
const RUN_CLEANUP_DELETE_BATCH_SIZE = 200;
const ARTIFACT_DELETE_BATCH_SIZE = 24;

function environmentPath(environmentId: string) {
  return `environments/${environmentId}`;
}

function normalizeManifestHash(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(normalized)) {
    return null;
  }
  return normalized;
}

function addManifestRef(
  refs: ManifestRef[],
  kind: ManifestKind,
  manifestHash: string | undefined | null,
  environmentId: string,
  dataId: string,
) {
  const normalized = normalizeManifestHash(manifestHash);
  if (!normalized) {
    return;
  }
  refs.push({
    kind,
    manifestHash: normalized,
    environmentId,
    dataId,
  });
}

function manifestRefKey(ref: ManifestRef) {
  return `${ref.kind}:${ref.manifestHash}:${ref.environmentId}:${ref.dataId}`;
}

function manifestObjectKey(ref: ManifestRef) {
  if (ref.kind === "data") {
    return `data/${ref.dataId}/manifests/${ref.manifestHash}.json`;
  }
  return `environments/${ref.environmentId}/manifests/code/${ref.manifestHash}.json`;
}

async function upsertDataManifestIndexRow(
  ctx: MutationCtx,
  args: {
    userId: string;
    dataId: string;
    manifestHash: string;
  },
) {
  const key = manifestObjectKey({
    kind: "data",
    manifestHash: args.manifestHash,
    environmentId: "",
    dataId: args.dataId,
  });
  const existing = await ctx.db
    .query("storageObjects")
    .withIndex("by_user_and_key", (q) => q.eq("userId", args.userId).eq("key", key))
    .first();
  const patch = {
    source: "data" as const,
    objectKind: "data_manifest" as const,
    key,
    name: `${args.manifestHash}.json`,
    size: 0,
    createdAt: Date.now(),
    runId: undefined,
    dataBlobId: undefined,
    dataId: args.dataId,
  };
  if (existing) {
    await ctx.db.patch("storageObjects", existing._id, patch);
    return;
  }
  await ctx.db.insert("storageObjects", {
    userId: args.userId,
    ...patch,
  });
}

async function deleteIndexedStorageKeys(ctx: MutationCtx, userId: string, keys: Iterable<string>) {
  const seen = new Set<string>();
  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const row = await ctx.db
      .query("storageObjects")
      .withIndex("by_user_and_key", (q) => q.eq("userId", userId).eq("key", key))
      .first();
    if (row) {
      await ctx.db.delete("storageObjects", row._id);
    }
  }
}

async function deleteIndexedStorageByPrefix(ctx: MutationCtx, userId: string, prefixes: string[]) {
  const filtered = prefixes.map((prefix) => prefix.trim()).filter((prefix) => prefix.length > 0);
  if (filtered.length === 0) {
    return;
  }
  const rows = await ctx.db
    .query("storageObjects")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) {
    if (filtered.some((prefix) => row.key.startsWith(prefix))) {
      await ctx.db.delete("storageObjects", row._id);
    }
  }
}

async function loadManifestBlobHashes(ctx: ActionCtx, ref: ManifestRef): Promise<Set<string>> {
  const hashes = new Set<string>();
  const key = manifestObjectKey(ref);
  const downloadUrl = await ctx.runQuery(internal.cli.sync.internalGetObjectDownloadUrl, { key });
  if (!downloadUrl) {
    return hashes;
  }
  let response: Response;
  try {
    response = await fetch(downloadUrl, { method: "GET" });
  } catch {
    return hashes;
  }
  if (!response.ok) {
    return hashes;
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return hashes;
  }
  const entries =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { entries?: unknown }).entries)
      ? ((parsed as { entries: unknown[] }).entries)
      : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const rawHash = (entry as { sha256?: unknown }).sha256;
    const hash = typeof rawHash === "string" ? normalizeManifestHash(rawHash) : null;
    if (hash) {
      hashes.add(hash);
    }
  }
  return hashes;
}

async function deleteObjectsByPrefix(ctx: MutationCtx | ActionCtx, prefix: string) {
  let cursor: string | null = null;
  let pages = 0;
  while (pages < 100) {
    const result = await r2.listMetadata(ctx, 100, cursor);
    for (const item of result.page) {
      if (!item.key.startsWith(prefix)) {
        continue;
      }
      try {
        await r2.deleteObject(ctx, item.key);
      } catch {
        // best-effort cleanup
      }
    }
    if (result.isDone) {
      return;
    }
    cursor = result.continueCursor;
    pages += 1;
  }
}

type RunCleanupRows = {
  runId: Id<"runs">;
  events: Array<Doc<"runEvents">>;
  runtimeLogs: Array<Doc<"runRuntimeLogs">>;
  runtimeMetrics: Array<Doc<"runRuntimeMetrics">>;
  wandbRuns: Array<Doc<"wandbRuns">>;
  wandbMetrics: Array<Doc<"wandbMetrics">>;
};

async function loadRunCleanupRows(
  ctx: MutationCtx,
  runIds: Array<Id<"runs">>,
): Promise<RunCleanupRows[]> {
  const out: RunCleanupRows[] = [];
  for (let start = 0; start < runIds.length; start += RUN_CLEANUP_QUERY_BATCH_SIZE) {
    const chunk = runIds.slice(start, start + RUN_CLEANUP_QUERY_BATCH_SIZE);
    const chunkRows = await Promise.all(
      chunk.map(async (runId) => {
        const [events, runtimeLogs, runtimeMetrics, wandbRuns, wandbMetrics] = await Promise.all([
          ctx.db
            .query("runEvents")
            .withIndex("by_run", (q) => q.eq("runId", runId))
            .collect(),
          ctx.db
            .query("runRuntimeLogs")
            .withIndex("by_run", (q) => q.eq("runId", runId))
            .collect(),
          ctx.db
            .query("runRuntimeMetrics")
            .withIndex("by_run", (q) => q.eq("runId", runId))
            .collect(),
          ctx.db
            .query("wandbRuns")
            .withIndex("by_run", (q) => q.eq("runId", runId))
            .collect(),
          ctx.db
            .query("wandbMetrics")
            .withIndex("by_run", (q) => q.eq("runId", runId))
            .collect(),
        ]);
        return { runId, events, runtimeLogs, runtimeMetrics, wandbRuns, wandbMetrics };
      }),
    );
    out.push(...chunkRows);
  }
  return out;
}

async function deleteRunCleanupRows(ctx: MutationCtx, rows: RunCleanupRows[]) {
  const eventIds: Array<Id<"runEvents">> = [];
  const runtimeLogIds: Array<Id<"runRuntimeLogs">> = [];
  const runtimeMetricIds: Array<Id<"runRuntimeMetrics">> = [];
  const wandbRunIds: Array<Id<"wandbRuns">> = [];
  const wandbMetricIds: Array<Id<"wandbMetrics">> = [];
  const runIds: Array<Id<"runs">> = [];

  for (const row of rows) {
    runIds.push(row.runId);
    for (const event of row.events) {
      eventIds.push(event._id);
    }
    for (const log of row.runtimeLogs) {
      runtimeLogIds.push(log._id);
    }
    for (const metric of row.runtimeMetrics) {
      runtimeMetricIds.push(metric._id);
    }
    for (const wandbRun of row.wandbRuns) {
      wandbRunIds.push(wandbRun._id);
    }
    for (const wandbMetric of row.wandbMetrics) {
      wandbMetricIds.push(wandbMetric._id);
    }
  }

  for (let start = 0; start < eventIds.length; start += RUN_CLEANUP_DELETE_BATCH_SIZE) {
    const chunk = eventIds.slice(start, start + RUN_CLEANUP_DELETE_BATCH_SIZE);
    await Promise.all(chunk.map((id) => ctx.db.delete("runEvents", id)));
  }
  for (let start = 0; start < runtimeLogIds.length; start += RUN_CLEANUP_DELETE_BATCH_SIZE) {
    const chunk = runtimeLogIds.slice(start, start + RUN_CLEANUP_DELETE_BATCH_SIZE);
    await Promise.all(chunk.map((id) => ctx.db.delete("runRuntimeLogs", id)));
  }
  for (let start = 0; start < runtimeMetricIds.length; start += RUN_CLEANUP_DELETE_BATCH_SIZE) {
    const chunk = runtimeMetricIds.slice(start, start + RUN_CLEANUP_DELETE_BATCH_SIZE);
    await Promise.all(chunk.map((id) => ctx.db.delete("runRuntimeMetrics", id)));
  }
  for (let start = 0; start < wandbRunIds.length; start += RUN_CLEANUP_DELETE_BATCH_SIZE) {
    const chunk = wandbRunIds.slice(start, start + RUN_CLEANUP_DELETE_BATCH_SIZE);
    await Promise.all(chunk.map((id) => ctx.db.delete("wandbRuns", id)));
  }
  for (let start = 0; start < wandbMetricIds.length; start += RUN_CLEANUP_DELETE_BATCH_SIZE) {
    const chunk = wandbMetricIds.slice(start, start + RUN_CLEANUP_DELETE_BATCH_SIZE);
    await Promise.all(chunk.map((id) => ctx.db.delete("wandbMetrics", id)));
  }
  for (let start = 0; start < runIds.length; start += RUN_CLEANUP_DELETE_BATCH_SIZE) {
    const chunk = runIds.slice(start, start + RUN_CLEANUP_DELETE_BATCH_SIZE);
    await Promise.all(chunk.map((id) => ctx.db.delete("runs", id)));
  }
}

async function deleteArtifactObjects(ctx: MutationCtx, keys: Set<string>) {
  const keyList = Array.from(keys);
  for (let start = 0; start < keyList.length; start += ARTIFACT_DELETE_BATCH_SIZE) {
    const chunk = keyList.slice(start, start + ARTIFACT_DELETE_BATCH_SIZE);
    await Promise.all(
      chunk.map(async (key) => {
        try {
          await r2.deleteObject(ctx, key);
        } catch {
          // best-effort cleanup
        }
      }),
    );
  }
}

function validateEnvironmentPayload(args: {
  gpu_count: number;
  volume_gb: number;
  framework: string;
  version: string;
  python_version: string;
}) {
  if (args.gpu_count < 1 || args.volume_gb < 1) {
    throw new ConvexError("invalid environment payload");
  }

  const versions = images[args.framework];
  if (!versions) {
    throw new ConvexError(`unsupported framework: ${args.framework}`);
  }
  const pythonVersions = versions[args.version];
  if (!pythonVersions) {
    throw new ConvexError(`unsupported version for framework ${args.framework}: ${args.version}`);
  }
  if (!pythonVersions[args.python_version]) {
    throw new ConvexError(`unsupported python version ${args.python_version} for ${args.framework} ${args.version}`);
  }
}

function getEnvironmentLastUpdatedAt(row: Doc<"environments">) {
  return row.latestSyncAt || row._creationTime;
}

function toEnvironmentResponse(
  row: Doc<"environments">,
  access: "private" | "shared" = "private",
) {
  const dataId = row.dataId || String(row._id);
  const serveSnapshot = row.serveSnapshot
    ? {
        command: row.serveSnapshot.command,
        python_version: row.serveSnapshot.pythonVersion,
        gpu_type: row.serveSnapshot.gpuType,
        gpu_count: row.serveSnapshot.gpuCount,
        volume_gb: row.serveSnapshot.volumeGb,
        port: row.serveSnapshot.port,
        health_path: row.serveSnapshot.healthPath,
        default_model_path: row.serveSnapshot.defaultModelPath,
        startup_timeout_seconds: row.serveSnapshot.startupTimeoutSeconds,
        health_interval_seconds: row.serveSnapshot.healthIntervalSeconds,
        health_timeout_seconds: row.serveSnapshot.healthTimeoutSeconds,
        health_failure_threshold: row.serveSnapshot.healthFailureThreshold,
        graceful_shutdown_seconds: row.serveSnapshot.gracefulShutdownSeconds,
      }
    : null;
  return {
    environment_id: String(row._id),
    data_id: dataId,
    access,
    created_at: row._creationTime,
    last_updated_at: getEnvironmentLastUpdatedAt(row),
    latest_data_manifest_hash: row.latestDataManifestHash || null,
    bound_data_ids: row.boundDataIds || [],
    bound_data_manifest_hashes: row.boundDataManifestHashes || [],
    name: row.name,
    artifacts: environmentPath(String(row._id)),
    gpu_type: row.gpuType,
    gpu_count: row.gpuCount,
    volume_gb: row.volumeGb,
    python_version: row.pythonVersion || PYTHON_CONFIG.defaultVersion,
    framework: row.framework,
    version: row.version,
    command: row.command,
    output_dir: row.outputDir ?? "outputs",
    serve_snapshot: serveSnapshot,
  };
}

async function hasEnvironmentShareLink(
  ctx: QueryCtx | MutationCtx,
  environmentId: string,
) {
  const link = await ctx.db
    .query("shareLinks")
    .withIndex("by_resource", (q) =>
      q.eq("resourceType", "environment").eq("resourceId", environmentId),
    )
    .first();
  return !!link;
}

async function toEnvironmentResponseWithAccess(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"environments">,
) {
  const environmentId = String(row._id);
  const isShared = await hasEnvironmentShareLink(ctx, environmentId);
  return toEnvironmentResponse(row, isShared ? "shared" : "private");
}

async function toEnvironmentConfigResponse(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"environments">,
) {
  return {
    environment: await toEnvironmentResponseWithAccess(ctx, row),
    config_name: ENVIRONMENT_CONFIG_FILE_NAME,
    config_text: renderEnvironmentConfig({
      name: row.name,
      framework: row.framework,
      version: row.version,
      python_version: row.pythonVersion || PYTHON_CONFIG.defaultVersion,
      gpu_type: row.gpuType,
      gpu_count: row.gpuCount,
      volume_gb: row.volumeGb,
    }),
  };
}

async function listByUserId(ctx: QueryCtx, userId: string) {
  const [rows, shareLinks] = await Promise.all([
    ctx.db
      .query("environments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("shareLinks")
      .withIndex("by_creator", (q) => q.eq("createdByUserId", userId))
      .collect(),
  ]);

  const sharedEnvironmentIds = new Set(
    shareLinks
      .filter((link) => link.resourceType === "environment")
      .map((link) => link.resourceId),
  );

  return {
    environments: rows
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((row) =>
        toEnvironmentResponse(
          row,
          sharedEnvironmentIds.has(String(row._id)) ? "shared" : "private",
        ),
      ),
  };
}

async function getAccessibleEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
  _requiredPermission?: "read" | "edit",
) {
  const row = await ctx.db.get("environments", environmentId);
  if (!row) {
    throw new ConvexError("environment not found");
  }
  if (row.userId !== userId) {
    throw new ConvexError("environment not found");
  }
  return row;
}

async function createEnvironmentForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    name: string;
    gpu_type: string;
    gpu_count: number;
    volume_gb: number;
    python_version: string;
    framework: string;
    version: string;
    command: string[];
    output_dir: string;
  },
) {
  validateEnvironmentPayload(args);

  const envId = await ctx.db.insert("environments", {
    userId: args.userId,
    name: args.name,
    artifacts: "",
    dataId: shortId("data"),
    boundDataIds: [],
    boundDataManifestHashes: [],
    gpuType: args.gpu_type,
    gpuCount: args.gpu_count,
    volumeGb: args.volume_gb,
    pythonVersion: args.python_version || PYTHON_CONFIG.defaultVersion,
    framework: args.framework,
    version: args.version,
    command: args.command,
    outputDir: args.output_dir,
  });

  await ctx.db.patch("environments", envId, {
    artifacts: environmentPath(String(envId)),
  });

  const env = await ctx.db.get("environments", envId);
  if (!env) {
    throw new ConvexError("failed to create environment");
  }

  return toEnvironmentResponse(env, "private");
}

function normalizeDataId(value: string) {
  return value.trim();
}

async function resolveOwnedDataIds(ctx: MutationCtx, userId: string) {
  const data = await ctx.runQuery(internal.data.internalList, { userId });
  const out = new Set<string>();
  for (const row of data.blobs) {
    const blobId = normalizeDataId(row.blob_id);
    if (blobId) {
      out.add(blobId);
    }
  }
  return out;
}

function normalizeDataIdList(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = normalizeDataId(raw);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

async function bindDataForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    data_ids: string[];
  },
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const requested = normalizeDataIdList(args.data_ids);
  if (requested.length === 0) {
    throw new ConvexError("at least one data id is required");
  }
  const owned = await resolveOwnedDataIds(ctx, args.userId);
  for (const id of requested) {
    if (!owned.has(id)) {
      throw new ConvexError(`data item ${id} is not available for this environment`);
    }
  }

  const current = normalizeDataIdList(env.boundDataIds || []);
  const next = normalizeDataIdList([...current, ...requested]).sort();
  await ctx.db.patch("environments", args.environmentId, {
    boundDataIds: next,
  });
  const updated = await ctx.db.get("environments", args.environmentId);
  if (!updated) {
    throw new ConvexError("failed to update environment data bindings");
  }
  return await toEnvironmentResponseWithAccess(ctx, updated);
}

async function unbindDataForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    data_ids: string[];
  },
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const requested = new Set(normalizeDataIdList(args.data_ids));
  if (requested.size === 0) {
    throw new ConvexError("at least one data id is required");
  }
  const current = normalizeDataIdList(env.boundDataIds || []);
  const next = current.filter((id) => !requested.has(id)).sort();
  await ctx.db.patch("environments", args.environmentId, {
    boundDataIds: next,
  });
  const updated = await ctx.db.get("environments", args.environmentId);
  if (!updated) {
    throw new ConvexError("failed to update environment data bindings");
  }
  return await toEnvironmentResponseWithAccess(ctx, updated);
}

async function updateEnvironmentSpecsForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
    python_version?: string;
    framework?: string;
    version?: string;
  },
) {
  const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
  const nextGpuType = typeof args.gpu_type === "string" && args.gpu_type.trim() !== "" ? args.gpu_type.trim() : env.gpuType;
  const nextGpuCount = typeof args.gpu_count === "number" ? args.gpu_count : env.gpuCount;
  const nextVolumeGb = typeof args.volume_gb === "number" ? args.volume_gb : env.volumeGb;
  const nextPythonVersion = typeof args.python_version === "string" && args.python_version.trim() !== "" ? args.python_version.trim() : (env.pythonVersion || PYTHON_CONFIG.defaultVersion);
  const nextFramework = typeof args.framework === "string" && args.framework.trim() !== "" ? args.framework.trim() : env.framework;
  const nextVersion = typeof args.version === "string" && args.version.trim() !== "" ? args.version.trim() : env.version;

  if (nextGpuCount < 1 || nextVolumeGb < 1) {
    throw new ConvexError("invalid environment payload");
  }

  // If any runtime field changed, validate the full combination against the image catalog.
  const runtimeChanged =
    nextFramework !== env.framework ||
    nextVersion !== env.version ||
    nextPythonVersion !== (env.pythonVersion || PYTHON_CONFIG.defaultVersion);
  if (runtimeChanged) {
    validateEnvironmentPayload({
      gpu_count: nextGpuCount,
      volume_gb: nextVolumeGb,
      framework: nextFramework,
      version: nextVersion,
      python_version: nextPythonVersion,
    });
  }

  await ctx.db.patch("environments", args.environmentId, {
    gpuType: nextGpuType,
    gpuCount: nextGpuCount,
    volumeGb: nextVolumeGb,
    framework: nextFramework,
    version: nextVersion,
    pythonVersion: nextPythonVersion,
  });

  const updated = await ctx.db.get("environments", args.environmentId);
  if (!updated) {
    throw new ConvexError("failed to update environment");
  }
  return await toEnvironmentResponseWithAccess(ctx, updated);
}

async function updateEnvironmentConfigForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    config_text: string;
  },
) {
  await getAccessibleEnvironment(ctx, args.userId, args.environmentId);

  let next;
  try {
    next = parseEnvironmentConfig(args.config_text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid environment config";
    throw new ConvexError(`invalid environment config: ${detail}`);
  }

  validateEnvironmentPayload(next);

  await ctx.db.patch("environments", args.environmentId, {
    name: next.name.trim(),
    framework: next.framework.trim(),
    version: next.version.trim(),
    pythonVersion: next.python_version.trim(),
    gpuType: next.gpu_type.trim(),
    gpuCount: next.gpu_count,
    volumeGb: next.volume_gb,
  });

  const updated = await ctx.db.get("environments", args.environmentId);
  if (!updated) {
    throw new ConvexError("failed to update environment config");
  }

  return await toEnvironmentConfigResponse(ctx, updated);
}

async function removeEnvironmentForUserId(ctx: MutationCtx, userId: string, environmentId: Id<"environments">) {
  const env = await getAccessibleEnvironment(ctx, userId, environmentId);
  const artifactKeys = new Set<string>();
  const siblingEnvironments = await ctx.db
    .query("environments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const otherEnvironments = siblingEnvironments.filter((candidate) => candidate._id !== environmentId);
  const envIdString = String(environmentId);
  const envDataId = env.dataId || envIdString;
  const deleteRefs: ManifestRef[] = [];
  const retainRefs: ManifestRef[] = [];

  // Cascade: delete all runs belonging to this environment
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_user_and_environment", (q) => q.eq("userId", userId).eq("environmentId", environmentId))
    .collect();
  const allRunsForUser = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const otherRuns = allRunsForUser.filter((run) => run.environmentId !== environmentId);
  const runIdsToDelete = runs.map((run) => run._id);
  const podsToTerminate: Array<{ runId: Id<"runs">; podId: string; runpodCredentialId?: Id<"runpodCredentials"> }> = [];

  addManifestRef(deleteRefs, "code", env.latestCodeManifestHash, envIdString, envDataId);
  addManifestRef(deleteRefs, "data", env.latestDataManifestHash, envIdString, envDataId);
  for (const other of otherEnvironments) {
    const otherEnvId = String(other._id);
    const otherDataId = other.dataId || otherEnvId;
    addManifestRef(retainRefs, "code", other.latestCodeManifestHash, otherEnvId, otherDataId);
    addManifestRef(retainRefs, "data", other.latestDataManifestHash, otherEnvId, otherDataId);
  }

  for (const run of runs) {
    const runDataId = run.dataId || envDataId;
    addManifestRef(deleteRefs, "code", run.codeManifestHash, String(run.environmentId), runDataId);
    addManifestRef(deleteRefs, "data", run.dataManifestHash, String(run.environmentId), runDataId);

    // Terminate Runpod pod if active
    if (run.podId) {
      podsToTerminate.push({
        runId: run._id,
        podId: run.podId,
        runpodCredentialId: run.runpodCredentialId,
      });
    }
    for (const key of run.artifactKeys || []) {
      artifactKeys.add(key);
    }
  }
  for (let start = 0; start < podsToTerminate.length; start += RUN_CLEANUP_QUERY_BATCH_SIZE) {
    const chunk = podsToTerminate.slice(start, start + RUN_CLEANUP_QUERY_BATCH_SIZE);
    await Promise.all(
      chunk.map((pod) =>
        ctx.scheduler.runAfter(0, internal.runs.internalTerminatePod, {
          runId: pod.runId,
          podId: pod.podId,
          runpodCredentialId: pod.runpodCredentialId,
          force: true,
        }),
      ),
    );
  }
  const runCleanupRows = await loadRunCleanupRows(ctx, runIdsToDelete);
  await deleteRunCleanupRows(ctx, runCleanupRows);

  for (const run of otherRuns) {
    const runDataId = run.dataId || String(run.environmentId);
    addManifestRef(retainRefs, "code", run.codeManifestHash, String(run.environmentId), runDataId);
    addManifestRef(retainRefs, "data", run.dataManifestHash, String(run.environmentId), runDataId);
  }

  const indexedDeleteKeys = new Set<string>(artifactKeys);
  for (const ref of deleteRefs) {
    indexedDeleteKeys.add(manifestObjectKey(ref));
  }
  const dataStillReferenced = retainRefs.some((ref) => ref.dataId === envDataId);
  await deleteIndexedStorageKeys(ctx, userId, indexedDeleteKeys);
  await deleteIndexedStorageByPrefix(ctx, userId, [
    `runs/${envIdString}/`,
    ...(dataStillReferenced ? [] : [`data/${envDataId}/`]),
  ]);

  await deleteArtifactObjects(ctx, artifactKeys);
  await ctx.scheduler.runAfter(0, internal.environments.internalCleanupDedupBlobs, {
    userId,
    environmentId: String(environmentId),
    dataId: envDataId,
    deleteRefs,
    retainRefs,
  });

  await ctx.db.delete("environments", environmentId);
  return { deleted: true, environment_id: String(environmentId) };
}

// ---------- public (auth via ctx.auth) ----------

export const list = query({
  args: {},
  returns: listEnvironmentsResponseValidator,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listByUserId(ctx, String(user._id));
  },
});

export const getConfig = query({
  args: { environmentId: v.id("environments") },
  returns: environmentConfigResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getAccessibleEnvironment(ctx, String(user._id), args.environmentId, "read");
    return await toEnvironmentConfigResponse(ctx, row);
  },
});

export const updateConfig = mutation({
  args: {
    environmentId: v.id("environments"),
    config_text: v.string(),
  },
  returns: environmentConfigResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return updateEnvironmentConfigForUserId(ctx, {
      userId: String(user._id),
      environmentId: args.environmentId,
      config_text: args.config_text,
    });
  },
});

export const bindData = mutation({
  args: {
    environmentId: v.id("environments"),
    data_ids: v.array(v.string()),
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return bindDataForUserId(ctx, {
      userId: String(user._id),
      environmentId: args.environmentId,
      data_ids: args.data_ids,
    });
  },
});

export const unbindData = mutation({
  args: {
    environmentId: v.id("environments"),
    data_ids: v.array(v.string()),
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return unbindDataForUserId(ctx, {
      userId: String(user._id),
      environmentId: args.environmentId,
      data_ids: args.data_ids,
    });
  },
});

export const remove = mutation({
  args: { environmentId: v.id("environments") },
  returns: v.object({ deleted: v.boolean(), environment_id: v.string() }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return removeEnvironmentForUserId(ctx, String(user._id), args.environmentId);
  },
});

// ---------- internal (for CLI proxy routes that pass userId explicitly) ----------

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listEnvironmentsResponseValidator,
  handler: async (ctx, args) => {
    return listByUserId(ctx, args.userId);
  },
});

export const internalGet = internalQuery({
  args: { userId: v.string(), environmentId: v.id("environments") },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    const row = await getAccessibleEnvironment(ctx, args.userId, args.environmentId, "read");
    return await toEnvironmentResponseWithAccess(ctx, row);
  },
});

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    gpu_type: v.string(),
    gpu_count: v.number(),
    volume_gb: v.number(),
    python_version: v.optional(v.string()),
    framework: v.string(),
    version: v.string(),
    command: v.array(v.string()),
    output_dir: v.string(),
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    return createEnvironmentForUserId(ctx, {
      ...args,
      python_version: args.python_version || PYTHON_CONFIG.defaultVersion,
    });
  },
});

export const internalRemove = internalMutation({
  args: { userId: v.string(), environmentId: v.id("environments") },
  returns: v.object({ deleted: v.boolean(), environment_id: v.string() }),
  handler: async (ctx, args) => {
    return removeEnvironmentForUserId(ctx, args.userId, args.environmentId);
  },
});

export const internalCleanupDedupBlobs = internalAction({
  args: {
    userId: v.string(),
    environmentId: v.string(),
    dataId: v.string(),
    deleteRefs: v.array(manifestRefValidator),
    retainRefs: v.array(manifestRefValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const uniqueDeleteRefs = new Map<string, ManifestRef>();
    const uniqueRetainRefs = new Map<string, ManifestRef>();
    for (const ref of args.deleteRefs) {
      uniqueDeleteRefs.set(manifestRefKey(ref), ref);
    }
    for (const ref of args.retainRefs) {
      uniqueRetainRefs.set(manifestRefKey(ref), ref);
    }

    const deleteBlobHashes = new Set<string>();
    const retainBlobHashes = new Set<string>();

    for (const ref of uniqueDeleteRefs.values()) {
      const hashes = await loadManifestBlobHashes(ctx, ref);
      for (const hash of hashes) {
        deleteBlobHashes.add(hash);
      }
    }
    for (const ref of uniqueRetainRefs.values()) {
      const hashes = await loadManifestBlobHashes(ctx, ref);
      for (const hash of hashes) {
        retainBlobHashes.add(hash);
      }
    }

    for (const hash of deleteBlobHashes) {
      if (retainBlobHashes.has(hash)) {
        continue;
      }
      try {
        await r2.deleteObject(ctx, `blobs/${hash}`);
      } catch {
        // best-effort cleanup
      }
    }
    await deleteObjectsByPrefix(ctx, `${environmentPath(args.environmentId)}/`);
    const dataStillReferenced = args.retainRefs.some((ref) => ref.dataId === args.dataId);
    if (!dataStillReferenced) {
      await deleteObjectsByPrefix(ctx, `data/${args.dataId}/`);
    }
    await deleteObjectsByPrefix(ctx, `runs/${args.environmentId}/`);
    return null;
  },
});

export const internalUpdateSpecs = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    gpu_type: v.optional(v.string()),
    gpu_count: v.optional(v.number()),
    volume_gb: v.optional(v.number()),
    python_version: v.optional(v.string()),
    framework: v.optional(v.string()),
    version: v.optional(v.string()),
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    const hasUpdate =
      typeof args.gpu_type !== "undefined" ||
      typeof args.gpu_count !== "undefined" ||
      typeof args.volume_gb !== "undefined" ||
      typeof args.python_version !== "undefined" ||
      typeof args.framework !== "undefined" ||
      typeof args.version !== "undefined";
    if (!hasUpdate) {
      throw new ConvexError("at least one update field is required");
    }
    return updateEnvironmentSpecsForUserId(ctx, args);
  },
});

export const internalCommitSyncPointers = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    code_manifest_hash: v.optional(v.string()),
    data_manifest_hash: v.optional(v.string()),
    command: v.optional(v.array(v.string())),
    output_dir: v.optional(v.string()),
    serve_snapshot: v.optional(serveSnapshotResponseValidator),
  },
  returns: commitSyncPointersResponseValidator,
  handler: async (ctx, args) => {
    const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId);
    const patch: {
      latestSyncAt: number;
      latestCodeManifestHash?: string;
      latestDataManifestHash?: string;
      command?: string[];
      outputDir?: string;
      serveSnapshot?: Doc<"environments">["serveSnapshot"];
    } = { latestSyncAt: Date.now() };

    if (args.code_manifest_hash) {
      patch.latestCodeManifestHash = args.code_manifest_hash;
    }
    if (args.data_manifest_hash) {
      patch.latestDataManifestHash = args.data_manifest_hash;
    }
    if (Array.isArray(args.command) && args.command.length > 0) {
      patch.command = args.command;
    }
    if (typeof args.output_dir === "string" && args.output_dir.trim() !== "") {
      patch.outputDir = args.output_dir.trim();
    }
    if (args.serve_snapshot) {
      patch.serveSnapshot = {
        command: args.serve_snapshot.command,
        pythonVersion: args.serve_snapshot.python_version,
        gpuType: args.serve_snapshot.gpu_type,
        gpuCount: args.serve_snapshot.gpu_count,
        volumeGb: args.serve_snapshot.volume_gb,
        port: args.serve_snapshot.port,
        healthPath: args.serve_snapshot.health_path,
        defaultModelPath: args.serve_snapshot.default_model_path,
        startupTimeoutSeconds: args.serve_snapshot.startup_timeout_seconds,
        healthIntervalSeconds: args.serve_snapshot.health_interval_seconds,
        healthTimeoutSeconds: args.serve_snapshot.health_timeout_seconds,
        healthFailureThreshold: args.serve_snapshot.health_failure_threshold,
        gracefulShutdownSeconds: args.serve_snapshot.graceful_shutdown_seconds,
      };
    }

    await ctx.db.patch("environments", args.environmentId, patch);
    if (args.data_manifest_hash) {
      const dataId = env.dataId || String(args.environmentId);
      await upsertDataManifestIndexRow(ctx, {
        userId: args.userId,
        dataId,
        manifestHash: args.data_manifest_hash,
      });
    }

    return {
      ok: true,
      environment_id: String(args.environmentId),
      code_manifest_hash: args.code_manifest_hash ?? env.latestCodeManifestHash,
      data_manifest_hash: args.data_manifest_hash ?? env.latestDataManifestHash,
    };
  },
});

export const internalBindData = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    data_ids: v.array(v.string()),
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    return bindDataForUserId(ctx, args);
  },
});

export const internalUnbindData = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    data_ids: v.array(v.string()),
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    return unbindDataForUserId(ctx, args);
  },
});
