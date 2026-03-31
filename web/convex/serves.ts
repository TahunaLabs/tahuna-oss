import { ConvexError, v } from "convex/values"
import { CopyObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { components, internal } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { internalAction, internalMutation, internalQuery } from "@convex/_generated/server"
import { R2 } from "@convex-dev/r2"
import { RUN_STATUS } from "@convex/runsConstants"
import { buildManifestObjectKey } from "@convex/cli/shared"
import {
  fetchServeSnapshotManifest,
  fetchSyncManifest,
  resolveServeSnapshotDownloadEntries,
  resolveSyncManifestDownloadEntries,
  type RuntimeBootstrapEntry,
} from "@convex/runtimeBootstrap"
import { getAccessibleEnvironment, getAccessibleRun } from "@convex/runsAccess"
import { getAccessibleServe } from "@convex/servesAccess"
import { SERVE_STATUS, TERMINAL_SERVE_STATUSES } from "@convex/servesConstants"
import { createServeForUserId, stopServeForUserId } from "@convex/servesLifecycle"
import { listByUserId, toServeLogsResponse, toServeResponse } from "@convex/servesRead"
import { sha256Hex } from "@convex/syncManifest"

const r2 = new R2(components.r2)

type ServeModelSnapshotResponse = {
  source_type: "run" | "storage"
  source_run_id: string | null
  source_object_prefix: string | null
  source_model_path: string | null
  object_prefix: string
  manifest_key: string
  manifest_hash: string
  object_count: number
  total_bytes: number
}

type ResolvedServeConfig = {
  command: string[]
  outputDir: string
  codeManifestHash: string
  dataManifestHash: string | null
  pythonVersion: string
  gpuType: string
  gpuCount: number
  volumeGb: number
  port: number
  healthPath: string
  defaultModelPath: string
  startupTimeoutSeconds: number
  healthIntervalSeconds: number
  healthTimeoutSeconds: number
  healthFailureThreshold: number
  gracefulShutdownSeconds: number
}

type ServeResponse = {
  serve_id: string
  created_at: number
  environment_id: string
  command: string[]
  output_dir: string
  logs: string
  status: string
  error: string
  pod_id: string
  code_manifest_hash: string
  data_manifest_hash: string
  python_version: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  port: number
  health_path: string
  default_model_path: string
  startup_timeout_seconds: number
  health_interval_seconds: number
  health_timeout_seconds: number
  health_failure_threshold: number
  graceful_shutdown_seconds: number
  model_snapshot: ServeModelSnapshotResponse
}

type SnapshotSourceSelection = {
  source_type: "run" | "storage"
  source_run_id: string | null
  source_object_prefix: string | null
  source_model_path: string | null
}

type SnapshotSourceEntry = {
  source_key: string
  path: string
  size: number
}

type SnapshotManifestEntry = {
  path: string
  key: string
  size: number
  sha256: string | null
}

type CreateServePreparation = {
  environment_id: string
  serve_config: ResolvedServeConfig
  source: SnapshotSourceSelection
  source_entries: SnapshotSourceEntry[]
}

type RuntimeBootstrapPlan = {
  serve_id: string
  contract_version: string
  environment_id: string
  workspace_root: string
  model_root: string
  output_dir: string
  logs_path: string
  command: string[]
  code: {
    manifest_hash: string
    entries: RuntimeBootstrapEntry[]
  }
  data: {
    manifest_hash: string | null
    entries: RuntimeBootstrapEntry[]
  }
  model: {
    manifest_hash: string
    entries: RuntimeBootstrapEntry[]
  }
  python_version: string
  port: number
  health_path: string
  startup_timeout_seconds: number
  health_interval_seconds: number
  health_timeout_seconds: number
  health_failure_threshold: number
  graceful_shutdown_seconds: number
  model_snapshot: ServeModelSnapshotResponse
}

type RuntimeBootstrapContext = {
  serve_id: string
  environment_id: string
  environment_data_id: string
  workspace_root: string
  model_root: string
  output_dir: string
  logs_path: string
  command: string[]
  code_manifest_hash: string | null
  data_manifest_hash: string | null
  python_version: string
  port: number
  health_path: string
  startup_timeout_seconds: number
  health_interval_seconds: number
  health_timeout_seconds: number
  health_failure_threshold: number
  graceful_shutdown_seconds: number
  model_snapshot: ServeModelSnapshotResponse
}

const resolvedServeConfigValidator = v.object({
  command: v.array(v.string()),
  outputDir: v.string(),
  codeManifestHash: v.string(),
  dataManifestHash: v.union(v.string(), v.null()),
  pythonVersion: v.string(),
  gpuType: v.string(),
  gpuCount: v.number(),
  volumeGb: v.number(),
  port: v.number(),
  healthPath: v.string(),
  defaultModelPath: v.string(),
  startupTimeoutSeconds: v.number(),
  healthIntervalSeconds: v.number(),
  healthTimeoutSeconds: v.number(),
  healthFailureThreshold: v.number(),
  gracefulShutdownSeconds: v.number(),
})

const serveModelSnapshotResponseValidator = v.object({
  source_type: v.union(v.literal("run"), v.literal("storage")),
  source_run_id: v.union(v.string(), v.null()),
  source_object_prefix: v.union(v.string(), v.null()),
  source_model_path: v.union(v.string(), v.null()),
  object_prefix: v.string(),
  manifest_key: v.string(),
  manifest_hash: v.string(),
  object_count: v.number(),
  total_bytes: v.number(),
})

const serveResponseValidator = v.object({
  serve_id: v.string(),
  created_at: v.number(),
  environment_id: v.string(),
  command: v.array(v.string()),
  output_dir: v.string(),
  logs: v.string(),
  status: v.string(),
  error: v.string(),
  pod_id: v.string(),
  code_manifest_hash: v.string(),
  data_manifest_hash: v.string(),
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
  model_snapshot: serveModelSnapshotResponseValidator,
})

const listServesResponseValidator = v.object({
  serves: v.array(serveResponseValidator),
})

const serveLogsResponseValidator = v.object({
  serve_id: v.string(),
  status: v.string(),
  logs_path: v.string(),
  log_file: v.string(),
  note: v.string(),
  logs_window: v.object({
    tail_limit: v.number(),
    startup_scan_limit: v.number(),
    pinned_bootstrap_limit: v.number(),
    scanned_tail: v.number(),
    scanned_startup: v.number(),
    pinned_bootstrap_count: v.number(),
    returned_logs: v.number(),
    includes_pinned_bootstrap: v.boolean(),
  }),
  recent_logs: v.array(
    v.object({
      timestamp: v.number(),
      level: v.string(),
      source: v.string(),
      message: v.string(),
    }),
  ),
})

const runtimeLogLineValidator = v.object({
  message: v.string(),
  level: v.optional(v.string()),
  source: v.optional(v.string()),
  timestamp: v.optional(v.number()),
})

const runtimeStatusValidator = v.union(
  v.literal(SERVE_STATUS.PROVISIONING),
  v.literal(SERVE_STATUS.STARTING),
  v.literal(SERVE_STATUS.SERVING),
  v.literal(SERVE_STATUS.STOPPING),
  v.literal(SERVE_STATUS.STOPPED),
  v.literal(SERVE_STATUS.FAILED),
)

const serveStopResponseValidator = v.object({
  serve_id: v.string(),
  stop_requested: v.boolean(),
  forced: v.boolean(),
  status: v.string(),
})

const snapshotSourceEntryValidator = v.object({
  source_key: v.string(),
  path: v.string(),
  size: v.number(),
})

const snapshotSourceSelectionValidator = v.object({
  source_type: v.union(v.literal("run"), v.literal("storage")),
  source_run_id: v.union(v.string(), v.null()),
  source_object_prefix: v.union(v.string(), v.null()),
  source_model_path: v.union(v.string(), v.null()),
})

const persistedModelSnapshotValidator = v.object({
  sourceType: v.union(v.literal("run"), v.literal("storage")),
  sourceRunId: v.optional(v.id("runs")),
  sourceObjectPrefix: v.optional(v.string()),
  sourceModelPath: v.optional(v.string()),
  objectPrefix: v.string(),
  manifestKey: v.string(),
  manifestHash: v.string(),
  objectCount: v.number(),
  totalBytes: v.number(),
})

const createServePreparationValidator = v.object({
  environment_id: v.string(),
  serve_config: resolvedServeConfigValidator,
  source: snapshotSourceSelectionValidator,
  source_entries: v.array(snapshotSourceEntryValidator),
})

const runtimeBootstrapEntryValidator = v.object({
  path: v.string(),
  sha256: v.string(),
  size: v.number(),
  mode: v.number(),
  download_url: v.string(),
})

const runtimeBootstrapContextValidator = v.object({
  serve_id: v.string(),
  environment_id: v.string(),
  environment_data_id: v.string(),
  workspace_root: v.string(),
  model_root: v.string(),
  output_dir: v.string(),
  logs_path: v.string(),
  command: v.array(v.string()),
  code_manifest_hash: v.union(v.string(), v.null()),
  data_manifest_hash: v.union(v.string(), v.null()),
  python_version: v.string(),
  port: v.number(),
  health_path: v.string(),
  startup_timeout_seconds: v.number(),
  health_interval_seconds: v.number(),
  health_timeout_seconds: v.number(),
  health_failure_threshold: v.number(),
  graceful_shutdown_seconds: v.number(),
  model_snapshot: serveModelSnapshotResponseValidator,
})

const runtimeBootstrapPlanValidator = v.object({
  serve_id: v.string(),
  contract_version: v.string(),
  environment_id: v.string(),
  workspace_root: v.string(),
  model_root: v.string(),
  output_dir: v.string(),
  logs_path: v.string(),
  command: v.array(v.string()),
  code: v.object({
    manifest_hash: v.string(),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
  data: v.object({
    manifest_hash: v.union(v.string(), v.null()),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
  model: v.object({
    manifest_hash: v.string(),
    entries: v.array(runtimeBootstrapEntryValidator),
  }),
  python_version: v.string(),
  port: v.number(),
  health_path: v.string(),
  startup_timeout_seconds: v.number(),
  health_interval_seconds: v.number(),
  health_timeout_seconds: v.number(),
  health_failure_threshold: v.number(),
  graceful_shutdown_seconds: v.number(),
  model_snapshot: serveModelSnapshotResponseValidator,
})

function normalizeProjectSubpath(value: string, field: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
  if (!normalized) {
    throw new ConvexError(`${field} is required`)
  }
  if (normalized.split("/").includes("..")) {
    throw new ConvexError(`${field} must not escape the workspace`)
  }
  return normalized
}

function normalizeStoragePrefix(value: string) {
  const normalized = value.trim().replace(/^\/+/, "").replace(/\/+$/, "")
  if (!normalized) {
    throw new ConvexError("from_storage_prefix is required")
  }
  return normalized
}

function resolveRunArtifactSnapshotPrefix(modelPath: string, outputDir: string) {
  const normalizedModelPath = normalizeProjectSubpath(modelPath, "model_path")
  const normalizedOutputDir = normalizeProjectSubpath(outputDir, "output_dir")
  if (normalizedModelPath === normalizedOutputDir) {
    return ""
  }
  if (!normalizedModelPath.startsWith(`${normalizedOutputDir}/`)) {
    throw new ConvexError("model_path must be within the environment output_dir")
  }
  return normalizedModelPath.slice(`${normalizedOutputDir}/`.length)
}

function leafName(value: string) {
  return value.split("/").filter(Boolean).pop() || "model"
}

function relativePathFromPrefixedKey(key: string, prefix: string) {
  if (key === prefix) {
    return leafName(prefix)
  }
  return key.slice(`${prefix}/`.length)
}

function matchesObjectPrefix(key: string, prefix: string) {
  return key === prefix || key.startsWith(`${prefix}/`)
}

function storagePrefixUpperBound(prefix: string) {
  return `${prefix}\uffff`
}

function buildCopySource(key: string) {
  return `${r2.config.bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`
}

function createSnapshotBasePrefix(environmentId: string) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `serves/${environmentId}/${Date.now()}-${suffix}`
}

function serializeSnapshotManifest(entries: SnapshotManifestEntry[], objectPrefix: string) {
  return JSON.stringify({
    version: "serve-model-snapshot.v1",
    object_prefix: objectPrefix,
    entries,
  })
}

function normalizeRuntimeLevel(level: string | undefined) {
  const trimmed = (level || "").trim().toLowerCase()
  if (trimmed === "debug" || trimmed === "warn" || trimmed === "warning" || trimmed === "error") {
    return trimmed === "warning" ? "warn" : trimmed
  }
  return "info"
}

function normalizeRuntimeSource(source: string | undefined) {
  const trimmed = (source || "").trim()
  return trimmed || "pod"
}

function normalizeRuntimeTimestamp(timestamp: number | undefined) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
    return Math.floor(timestamp)
  }
  return Date.now()
}

function sanitizeRuntimeMessage(message: string) {
  const trimmed = message.trim()
  if (!trimmed) {
    return ""
  }
  return trimmed.slice(0, 4000)
}

function defaultServeStatusMessage(status: string) {
  if (status === SERVE_STATUS.PROVISIONING) return "serve provisioning"
  if (status === SERVE_STATUS.STARTING) return "serve starting"
  if (status === SERVE_STATUS.SERVING) return "serve healthy and serving"
  if (status === SERVE_STATUS.STOPPING) return "serve stopping"
  if (status === SERVE_STATUS.STOPPED) return "serve stopped"
  return "serve failed"
}

function canTransitionServeStatus(current: string, next: string) {
  if (current === next) {
    return true
  }
  if (current === SERVE_STATUS.QUEUED) {
    return next === SERVE_STATUS.PROVISIONING || next === SERVE_STATUS.FAILED
  }
  if (current === SERVE_STATUS.PROVISIONING) {
    return next === SERVE_STATUS.STARTING || next === SERVE_STATUS.STOPPING || next === SERVE_STATUS.FAILED
  }
  if (current === SERVE_STATUS.STARTING) {
    return next === SERVE_STATUS.SERVING || next === SERVE_STATUS.STOPPING || next === SERVE_STATUS.FAILED
  }
  if (current === SERVE_STATUS.SERVING) {
    return next === SERVE_STATUS.STOPPING || next === SERVE_STATUS.FAILED
  }
  if (current === SERVE_STATUS.STOPPING) {
    return next === SERVE_STATUS.STOPPED
  }
  return false
}

export const internalList = internalQuery({
  args: { userId: v.string() },
  returns: listServesResponseValidator,
  handler: async (ctx, args) => {
    return listByUserId(ctx, args.userId)
  },
})

export const internalGet = internalQuery({
  args: { userId: v.string(), serveId: v.id("serves") },
  returns: serveResponseValidator,
  handler: async (ctx, args) => {
    const row = await getAccessibleServe(ctx, args.userId, args.serveId)
    return toServeResponse(row)
  },
})

export const internalGetLogs = internalQuery({
  args: { userId: v.string(), serveId: v.id("serves") },
  returns: serveLogsResponseValidator,
  handler: async (ctx, args) => {
    const row = await getAccessibleServe(ctx, args.userId, args.serveId)
    return toServeLogsResponse(ctx, row)
  },
})

export const internalPrepareCreate = internalQuery({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    fromRunId: v.optional(v.id("runs")),
    fromStoragePrefix: v.optional(v.string()),
    modelPath: v.optional(v.string()),
  },
  returns: createServePreparationValidator,
  handler: async (ctx, args) => {
    const env = await getAccessibleEnvironment(ctx, args.userId, args.environmentId)
    const serveSnapshot = env.serveSnapshot
    if (!serveSnapshot || !Array.isArray(serveSnapshot.command) || serveSnapshot.command.length === 0) {
      throw new ConvexError("environment has no serve config configured; run `tahuna sync` before creating a serve")
    }
    if (!env.latestCodeManifestHash) {
      throw new ConvexError("environment code is not synced; run `tahuna sync` before creating a serve")
    }

    const hasRunSource = !!args.fromRunId
    const hasStorageSource = !!args.fromStoragePrefix?.trim()
    if ((hasRunSource ? 1 : 0) + (hasStorageSource ? 1 : 0) !== 1) {
      throw new ConvexError("exactly one model source is required")
    }

    const serveConfig: ResolvedServeConfig = {
      command: serveSnapshot.command,
      outputDir: env.outputDir,
      codeManifestHash: env.latestCodeManifestHash,
      dataManifestHash: env.latestDataManifestHash || null,
      pythonVersion: serveSnapshot.pythonVersion,
      gpuType: serveSnapshot.gpuType,
      gpuCount: serveSnapshot.gpuCount,
      volumeGb: serveSnapshot.volumeGb,
      port: serveSnapshot.port,
      healthPath: serveSnapshot.healthPath,
      defaultModelPath: serveSnapshot.defaultModelPath,
      startupTimeoutSeconds: serveSnapshot.startupTimeoutSeconds,
      healthIntervalSeconds: serveSnapshot.healthIntervalSeconds,
      healthTimeoutSeconds: serveSnapshot.healthTimeoutSeconds,
      healthFailureThreshold: serveSnapshot.healthFailureThreshold,
      gracefulShutdownSeconds: serveSnapshot.gracefulShutdownSeconds,
    }

    let source: SnapshotSourceSelection
    let sourceEntries: SnapshotSourceEntry[] = []

    if (args.fromRunId) {
      const run = await getAccessibleRun(ctx, args.userId, args.fromRunId)
      if (run.status !== RUN_STATUS.COMPLETED) {
        throw new ConvexError("source run must be completed")
      }
      const outputPath = (run.output || "").trim()
      if (!outputPath) {
        throw new ConvexError("source run has no output artifacts")
      }
      const runOutputDir = normalizeProjectSubpath(run.outputDir || "", "output_dir")
      const modelPath = normalizeProjectSubpath(args.modelPath || serveSnapshot.defaultModelPath, "model_path")
      const relativeArtifactPrefix = resolveRunArtifactSnapshotPrefix(modelPath, runOutputDir)
      const sourcePrefix = relativeArtifactPrefix ? `${outputPath}/${relativeArtifactPrefix}` : outputPath
      const matchingKeys = (run.artifactKeys || [])
        .filter((key) => matchesObjectPrefix(key, sourcePrefix))
        .sort((a, b) => a.localeCompare(b))
      if (matchingKeys.length === 0) {
        throw new ConvexError("source run has no artifacts under the selected model path")
      }

      source = {
        source_type: "run",
        source_run_id: String(run._id),
        source_object_prefix: null,
        source_model_path: modelPath,
      }
      sourceEntries = matchingKeys.map((key) => ({
        source_key: key,
        path: relativePathFromPrefixedKey(key, sourcePrefix),
        size: 0,
      }))
    } else {
      const objectPrefix = normalizeStoragePrefix(args.fromStoragePrefix || "")
      const storageRows = await ctx.db
        .query("storageObjects")
        .withIndex("by_user_and_key", (q) =>
          q.eq("userId", args.userId).gte("key", objectPrefix).lt("key", storagePrefixUpperBound(objectPrefix)),
        )
        .collect()
      const matchingRows = storageRows
        .filter((row) => matchesObjectPrefix(row.key, objectPrefix))
        .sort((a, b) => a.key.localeCompare(b.key))
      if (matchingRows.length === 0) {
        throw new ConvexError("storage prefix has no objects")
      }

      source = {
        source_type: "storage",
        source_run_id: null,
        source_object_prefix: objectPrefix,
        source_model_path: null,
      }
      sourceEntries = matchingRows.map((row) => ({
        source_key: row.key,
        path: relativePathFromPrefixedKey(row.key, objectPrefix),
        size: row.size,
      }))
    }

    return {
      environment_id: String(args.environmentId),
      serve_config: serveConfig,
      source,
      source_entries: sourceEntries,
    }
  },
})

export const internalCreate = internalAction({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    fromRunId: v.optional(v.id("runs")),
    fromStoragePrefix: v.optional(v.string()),
    modelPath: v.optional(v.string()),
  },
  returns: serveResponseValidator,
  handler: async (ctx, args): Promise<ServeResponse> => {
    const preparation: CreateServePreparation = await ctx.runQuery(internal.serves.internalPrepareCreate, args)
    const snapshotBasePrefix = createSnapshotBasePrefix(preparation.environment_id)
    const objectPrefix = `${snapshotBasePrefix}/model`
    const manifestKey = `${snapshotBasePrefix}/model-manifest.json`
    const copiedKeys: string[] = []
    const manifestEntries: SnapshotManifestEntry[] = []
    let totalBytes = 0

    try {
      for (const entry of preparation.source_entries) {
        const targetKey = `${objectPrefix}/${entry.path}`
        await r2.client.send(
          new CopyObjectCommand({
            Bucket: r2.config.bucket,
            CopySource: buildCopySource(entry.source_key),
            Key: targetKey,
            MetadataDirective: "COPY",
          }),
        )
        copiedKeys.push(targetKey)
        await r2.syncMetadata(ctx, targetKey)
        const metadata = await r2.getMetadata(ctx, targetKey)
        const size = typeof metadata?.size === "number" && Number.isFinite(metadata.size) ? metadata.size : entry.size
        manifestEntries.push({
          path: entry.path,
          key: targetKey,
          size,
          sha256: metadata?.sha256 || null,
        })
        totalBytes += size
      }

      const manifestJson = serializeSnapshotManifest(manifestEntries, objectPrefix)
      const manifestHash = await sha256Hex(manifestJson)
      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.config.bucket,
          Key: manifestKey,
          Body: manifestJson,
          ContentType: "application/json",
        }),
      )
      copiedKeys.push(manifestKey)
      await r2.syncMetadata(ctx, manifestKey)

      return await ctx.runMutation(internal.serves.internalInsertCreatedServe, {
        userId: args.userId,
        environmentId: args.environmentId,
        serveConfig: preparation.serve_config,
        modelSnapshot: {
          sourceType: preparation.source.source_type,
          sourceRunId:
            preparation.source.source_type === "run" && preparation.source.source_run_id
              ? (preparation.source.source_run_id as Id<"runs">)
              : undefined,
          sourceObjectPrefix: preparation.source.source_object_prefix || undefined,
          sourceModelPath: preparation.source.source_model_path || undefined,
          objectPrefix,
          manifestKey,
          manifestHash,
          objectCount: manifestEntries.length,
          totalBytes,
        },
      })
    } catch (error) {
      for (const key of copiedKeys) {
        try {
          await r2.deleteObject(ctx, key)
        } catch {
          // Best-effort cleanup only.
        }
      }
      throw error
    }
  },
})

export const internalInsertCreatedServe = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    serveConfig: resolvedServeConfigValidator,
    modelSnapshot: persistedModelSnapshotValidator,
  },
  returns: serveResponseValidator,
  handler: async (ctx, args) => {
    return createServeForUserId(ctx, args)
  },
})

export const internalStop = internalMutation({
  args: {
    userId: v.string(),
    serveId: v.id("serves"),
    force: v.optional(v.boolean()),
  },
  returns: serveStopResponseValidator,
  handler: async (ctx, args) => {
    return stopServeForUserId(ctx, args.userId, args.serveId, args.force === true)
  },
})

export const setRuntimeTokenHash = internalMutation({
  args: {
    serveId: v.id("serves"),
    runtimeTokenHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("serves", args.serveId)
    if (!row) {
      return null
    }
    await ctx.db.patch("serves", args.serveId, { runtimeTokenHash: args.runtimeTokenHash })
    return null
  },
})

export const internalValidateRuntimeToken = internalQuery({
  args: { serveId: v.id("serves"), tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("serves", args.serveId)
    return !!row?.runtimeTokenHash && row.runtimeTokenHash === args.tokenHash
  },
})

export const internalGetRuntimeBootstrapContext = internalQuery({
  args: { serveId: v.id("serves") },
  returns: runtimeBootstrapContextValidator,
  handler: async (ctx, args): Promise<RuntimeBootstrapContext> => {
    const row = await ctx.db.get("serves", args.serveId)
    if (!row) {
      throw new ConvexError("serve not found")
    }
    const environment = await ctx.db.get(row.environmentId)
    if (!environment) {
      throw new ConvexError("environment not found")
    }
    return {
      serve_id: String(row._id),
      environment_id: String(row.environmentId),
      environment_data_id: environment.dataId || String(environment._id),
      workspace_root: "/workspace",
      model_root: "/workspace/model",
      output_dir: row.outputDir,
      logs_path: row.logs,
      command: row.command,
      code_manifest_hash: row.codeManifestHash || null,
      data_manifest_hash: row.dataManifestHash || null,
      python_version: row.pythonVersion,
      port: row.port,
      health_path: row.healthPath,
      startup_timeout_seconds: row.startupTimeoutSeconds,
      health_interval_seconds: row.healthIntervalSeconds,
      health_timeout_seconds: row.healthTimeoutSeconds,
      health_failure_threshold: row.healthFailureThreshold,
      graceful_shutdown_seconds: row.gracefulShutdownSeconds,
      model_snapshot: toServeResponse(row).model_snapshot,
    }
  },
})

export const internalGetRuntimeBootstrapPlan = internalAction({
  args: { serveId: v.id("serves") },
  returns: runtimeBootstrapPlanValidator,
  handler: async (ctx, args): Promise<RuntimeBootstrapPlan> => {
    const bootstrap: RuntimeBootstrapContext = await ctx.runQuery(internal.serves.internalGetRuntimeBootstrapContext, {
      serveId: args.serveId,
    })
    if (!bootstrap.code_manifest_hash) {
      throw new Error("missing pinned code manifest hash on serve")
    }

    const codeManifest = await fetchSyncManifest(
      ctx,
      "code",
      buildManifestObjectKey(
        bootstrap.environment_id,
        bootstrap.environment_data_id,
        "code",
        bootstrap.code_manifest_hash,
      ),
      bootstrap.code_manifest_hash,
    )
    const codeEntries = await resolveSyncManifestDownloadEntries(ctx, "code", codeManifest)

    let dataEntries: RuntimeBootstrapEntry[] = []
    if (bootstrap.data_manifest_hash) {
      const dataManifest = await fetchSyncManifest(
        ctx,
        "data",
        buildManifestObjectKey(
          bootstrap.environment_id,
          bootstrap.environment_data_id,
          "data",
          bootstrap.data_manifest_hash,
        ),
        bootstrap.data_manifest_hash,
      )
      dataEntries = await resolveSyncManifestDownloadEntries(ctx, "data", dataManifest)
    }

    const modelManifest = await fetchServeSnapshotManifest(
      ctx,
      bootstrap.model_snapshot.manifest_key,
      bootstrap.model_snapshot.manifest_hash,
    )
    const modelEntries = await resolveServeSnapshotDownloadEntries(ctx, modelManifest)

    return {
      serve_id: bootstrap.serve_id,
      contract_version: "serve.v1",
      environment_id: bootstrap.environment_id,
      workspace_root: bootstrap.workspace_root,
      model_root: bootstrap.model_root,
      output_dir: bootstrap.output_dir,
      logs_path: bootstrap.logs_path,
      command: bootstrap.command,
      code: {
        manifest_hash: bootstrap.code_manifest_hash,
        entries: codeEntries,
      },
      data: {
        manifest_hash: bootstrap.data_manifest_hash,
        entries: dataEntries,
      },
      model: {
        manifest_hash: bootstrap.model_snapshot.manifest_hash,
        entries: modelEntries,
      },
      python_version: bootstrap.python_version,
      port: bootstrap.port,
      health_path: bootstrap.health_path,
      startup_timeout_seconds: bootstrap.startup_timeout_seconds,
      health_interval_seconds: bootstrap.health_interval_seconds,
      health_timeout_seconds: bootstrap.health_timeout_seconds,
      health_failure_threshold: bootstrap.health_failure_threshold,
      graceful_shutdown_seconds: bootstrap.graceful_shutdown_seconds,
      model_snapshot: bootstrap.model_snapshot,
    }
  },
})

export const ingestRuntimeLogs = internalMutation({
  args: {
    serveId: v.id("serves"),
    lines: v.array(runtimeLogLineValidator),
  },
  returns: v.object({ accepted: v.number() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("serves", args.serveId)
    if (!row) {
      return { accepted: 0 }
    }
    let accepted = 0
    for (const line of args.lines.slice(0, 500)) {
      const message = sanitizeRuntimeMessage(line.message)
      if (!message) {
        continue
      }
      await ctx.db.insert("serveRuntimeLogs", {
        serveId: args.serveId,
        timestamp: normalizeRuntimeTimestamp(line.timestamp),
        level: normalizeRuntimeLevel(line.level),
        source: normalizeRuntimeSource(line.source),
        message,
      })
      accepted += 1
    }
    return { accepted }
  },
})

export const ingestRuntimeStatus = internalMutation({
  args: {
    serveId: v.id("serves"),
    status: runtimeStatusValidator,
    message: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.object({ status: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("serves", args.serveId)
    if (!row) {
      return { status: "missing" }
    }
    if (TERMINAL_SERVE_STATUSES.has(row.status)) {
      return { status: row.status }
    }

    let nextStatus = args.status
    if (row.status === SERVE_STATUS.STOPPING && (args.status === SERVE_STATUS.FAILED || args.status === SERVE_STATUS.STOPPED)) {
      nextStatus = SERVE_STATUS.STOPPED
    }
    if (!canTransitionServeStatus(row.status, nextStatus)) {
      throw new ConvexError(`invalid serve status transition: ${row.status} -> ${nextStatus}`)
    }

    const patch: {
      status: string;
      error?: string;
      runtimeTokenHash?: string;
    } = { status: nextStatus }
    if (nextStatus === SERVE_STATUS.FAILED) {
      patch.error = sanitizeRuntimeMessage(args.error || args.message || "serve failed") || "serve failed"
      patch.runtimeTokenHash = "revoked"
    }
    if (nextStatus === SERVE_STATUS.STOPPED) {
      patch.runtimeTokenHash = "revoked"
    }
    if (nextStatus !== SERVE_STATUS.FAILED && row.error) {
      patch.error = undefined
    }

    await ctx.db.patch("serves", args.serveId, patch)
    await ctx.db.insert("serveEvents", {
      serveId: args.serveId,
      status: nextStatus,
      message:
        sanitizeRuntimeMessage(
          nextStatus === SERVE_STATUS.FAILED
            ? args.error || args.message || defaultServeStatusMessage(nextStatus)
            : args.message || defaultServeStatusMessage(nextStatus),
        ) || defaultServeStatusMessage(nextStatus),
      metadata: {
        source: "serve-runtime",
      },
    })

    return { status: nextStatus }
  },
})
