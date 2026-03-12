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
import { PYTHON_CONFIG } from "../config";

const environmentResponseValidator = v.object({
  environment_id: v.string(),
  data_id: v.string(),
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
});

const listEnvironmentsResponseValidator = v.object({
  environments: v.array(environmentResponseValidator),
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

function environmentPath(userId: string, environmentId: string) {
  return `${userId}/environment/${environmentId}`;
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

function manifestObjectKey(userId: string, ref: ManifestRef) {
  if (ref.kind === "data") {
    return `${userId}/data/${ref.dataId}/manifests/${ref.manifestHash}.json`;
  }
  return `${userId}/environment/${ref.environmentId}/manifests/code/${ref.manifestHash}.json`;
}

async function loadManifestBlobHashes(ctx: ActionCtx, userId: string, ref: ManifestRef): Promise<Set<string>> {
  const hashes = new Set<string>();
  const key = manifestObjectKey(userId, ref);
  const downloadUrl = await ctx.runQuery(internal.cli.internalGetObjectDownloadUrl, { key });
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

function validateEnvironmentPayload(args: {
  gpu_count: number;
  volume_gb: number;
  framework: string;
  version: string;
}) {
  if (args.gpu_count < 1 || args.volume_gb < 1) {
    throw new ConvexError("invalid environment payload");
  }

  const versions = images[args.framework];
  if (!versions) {
    throw new ConvexError(`unsupported framework: ${args.framework}`);
  }
  if (!versions[args.version]) {
    throw new ConvexError(`unsupported version for framework ${args.framework}: ${args.version}`);
  }
}

function toEnvironmentResponse(row: Doc<"environments">) {
  const dataId = row.dataId || String(row._id);
  return {
    environment_id: String(row._id),
    data_id: dataId,
    bound_data_ids: row.boundDataIds || [],
    bound_data_manifest_hashes: row.boundDataManifestHashes || [],
    name: row.name,
    artifacts: environmentPath(row.userId, String(row._id)),
    gpu_type: row.gpuType,
    gpu_count: row.gpuCount,
    volume_gb: row.volumeGb,
    python_version: row.pythonVersion || PYTHON_CONFIG.defaultVersion,
    framework: row.framework,
    version: row.version,
  };
}

async function listByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("environments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return {
    environments: rows.sort((a, b) => b._creationTime - a._creationTime).map(toEnvironmentResponse),
  };
}

async function getOwnedEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
) {
  const row = await ctx.db.get("environments", environmentId);
  if (!row || row.userId !== userId) {
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
  });

  await ctx.db.patch("environments", envId, {
    artifacts: environmentPath(args.userId, String(envId)),
  });

  const env = await ctx.db.get("environments", envId);
  if (!env) {
    throw new ConvexError("failed to create environment");
  }

  return toEnvironmentResponse(env);
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
  const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
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
  return toEnvironmentResponse(updated);
}

async function unbindDataForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    data_ids: string[];
  },
) {
  const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
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
  return toEnvironmentResponse(updated);
}

async function updateEnvironmentSpecsForUserId(
  ctx: MutationCtx,
  args: {
    userId: string;
    environmentId: Id<"environments">;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
  },
) {
  const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
  const nextGpuType = typeof args.gpu_type === "string" && args.gpu_type.trim() !== "" ? args.gpu_type.trim() : env.gpuType;
  const nextGpuCount = typeof args.gpu_count === "number" ? args.gpu_count : env.gpuCount;
  const nextVolumeGb = typeof args.volume_gb === "number" ? args.volume_gb : env.volumeGb;

  if (nextGpuCount < 1 || nextVolumeGb < 1) {
    throw new ConvexError("invalid environment payload");
  }

  await ctx.db.patch("environments", args.environmentId, {
    gpuType: nextGpuType,
    gpuCount: nextGpuCount,
    volumeGb: nextVolumeGb,
  });

  const updated = await ctx.db.get("environments", args.environmentId);
  if (!updated) {
    throw new ConvexError("failed to update environment");
  }
  return toEnvironmentResponse(updated);
}

async function removeEnvironmentForUserId(ctx: MutationCtx, userId: string, environmentId: Id<"environments">) {
  const env = await getOwnedEnvironment(ctx, userId, environmentId);
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
      await ctx.scheduler.runAfter(0, internal.runs.internalTerminatePod, {
        runId: run._id,
        podId: run.podId,
        force: true,
      });
    }

    // Delete run events, logs, and metrics
    const [events, runtimeLogs, runtimeMetrics] = await Promise.all([
      ctx.db
        .query("runEvents")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect(),
      ctx.db
        .query("runRuntimeLogs")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect(),
      ctx.db
        .query("runRuntimeMetrics")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect(),
    ]);
    for (const key of run.artifactKeys || []) {
      artifactKeys.add(key);
    }
    await Promise.all([
      ...events.map((event) => ctx.db.delete(event._id)),
      ...runtimeLogs.map((entry) => ctx.db.delete(entry._id)),
      ...runtimeMetrics.map((entry) => ctx.db.delete(entry._id)),
    ]);
    await ctx.db.delete("runs", run._id);
  }
  for (const run of otherRuns) {
    const runDataId = run.dataId || String(run.environmentId);
    addManifestRef(retainRefs, "code", run.codeManifestHash, String(run.environmentId), runDataId);
    addManifestRef(retainRefs, "data", run.dataManifestHash, String(run.environmentId), runDataId);
  }

  for (const key of artifactKeys) {
    try {
      await r2.deleteObject(ctx, key);
    } catch {
      // best-effort cleanup
    }
  }
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

export const get = query({
  args: { environmentId: v.id("environments") },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const row = await getOwnedEnvironment(ctx, String(user._id), args.environmentId);
    return toEnvironmentResponse(row);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    gpu_type: v.string(),
    gpu_count: v.number(),
    volume_gb: v.number(),
    python_version: v.optional(v.string()),
    framework: v.string(),
    version: v.string(),
  },
  returns: environmentResponseValidator,
  handler: async (_ctx, _args) => {
    throw new ConvexError("environments can only be created via `tahuna init`");
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
    const row = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
    return toEnvironmentResponse(row);
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
      const hashes = await loadManifestBlobHashes(ctx, args.userId, ref);
      for (const hash of hashes) {
        deleteBlobHashes.add(hash);
      }
    }
    for (const ref of uniqueRetainRefs.values()) {
      const hashes = await loadManifestBlobHashes(ctx, args.userId, ref);
      for (const hash of hashes) {
        retainBlobHashes.add(hash);
      }
    }

    for (const hash of deleteBlobHashes) {
      if (retainBlobHashes.has(hash)) {
        continue;
      }
      try {
        await r2.deleteObject(ctx, `${args.userId}/blobs/${hash}`);
      } catch {
        // best-effort cleanup
      }
    }
    await deleteObjectsByPrefix(ctx, `${environmentPath(args.userId, args.environmentId)}/`);
    const dataStillReferenced = args.retainRefs.some((ref) => ref.dataId === args.dataId);
    if (!dataStillReferenced) {
      await deleteObjectsByPrefix(ctx, `${args.userId}/data/${args.dataId}/`);
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
  },
  returns: environmentResponseValidator,
  handler: async (ctx, args) => {
    if (typeof args.gpu_type === "undefined" && typeof args.gpu_count === "undefined" && typeof args.volume_gb === "undefined") {
      throw new ConvexError("at least one of gpu_type, gpu_count, or volume_gb is required");
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
  },
  returns: commitSyncPointersResponseValidator,
  handler: async (ctx, args) => {
    const env = await getOwnedEnvironment(ctx, args.userId, args.environmentId);
    const patch: {
      latestSyncAt: number;
      latestCodeManifestHash?: string;
      latestDataManifestHash?: string;
    } = { latestSyncAt: Date.now() };

    if (args.code_manifest_hash) {
      patch.latestCodeManifestHash = args.code_manifest_hash;
    }
    if (args.data_manifest_hash) {
      patch.latestDataManifestHash = args.data_manifest_hash;
    }

    await ctx.db.patch("environments", args.environmentId, patch);

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
