import { ConvexError, v } from "convex/values"
import { CopyObjectCommand } from "@aws-sdk/client-s3"
import { components, internal } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { internalAction, internalMutation, internalQuery } from "@convex/_generated/server"
import { R2 } from "@convex-dev/r2"
import { RUN_STATUS } from "@convex/runsConstants"
import { getAccessibleEnvironment, getAccessibleRun } from "@convex/runsAccess"
import { getAccessibleServe } from "@convex/servesAccess"
import { SERVE_STATUS, TERMINAL_SERVE_STATUSES } from "@convex/servesConstants"
import { createServeForUserId, stopServeForUserId } from "@convex/servesLifecycle"
import { listByUserId, toServeLogsResponse, toServeResponse } from "@convex/servesRead"

const r2 = new R2(components.r2)

type ServeModelSnapshotResponse = {
  source_type: "run" | "storage"
  source_run_id: string | null
  source_object_prefix: string | null
  source_model_path: string | null
  object_prefix: string
  object_count: number
  total_bytes: number
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

type SnapshotSourceEntry = {
  source_key: string
  relative_path: string
  size: number
}

type CreateServePreparation = {
  environment_id: string
  command: string[]
  output_dir: string
  code_manifest_hash: string
  data_manifest_hash: string | null
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
  source_type: "run" | "storage"
  source_run_id: string | null
  source_object_prefix: string | null
  source_model_path: string | null
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

const serveModelSnapshotResponseValidator = v.object({
  source_type: v.union(v.literal("run"), v.literal("storage")),
  source_run_id: v.union(v.string(), v.null()),
  source_object_prefix: v.union(v.string(), v.null()),
  source_model_path: v.union(v.string(), v.null()),
  object_prefix: v.string(),
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
  relative_path: v.string(),
  size: v.number(),
})

const createServePreparationValidator = v.object({
  environment_id: v.string(),
  command: v.array(v.string()),
  output_dir: v.string(),
  code_manifest_hash: v.string(),
  data_manifest_hash: v.union(v.string(), v.null()),
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
  source_type: v.union(v.literal("run"), v.literal("storage")),
  source_run_id: v.union(v.string(), v.null()),
  source_object_prefix: v.union(v.string(), v.null()),
  source_model_path: v.union(v.string(), v.null()),
  source_entries: v.array(snapshotSourceEntryValidator),
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

function buildCopySource(key: string) {
  return `${r2.config.bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`
}

function createSnapshotPrefix(environmentId: string) {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `serves/${environmentId}/${Date.now()}-${suffix}/model`
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

    let sourceType: "run" | "storage"
    let sourceRunId: string | null = null
    let sourceObjectPrefix: string | null = null
    let sourceModelPath: string | null = null
    let sourceEntries: Array<{ source_key: string; relative_path: string; size: number }> = []

    if (args.fromRunId) {
      const run = await getAccessibleRun(ctx, args.userId, args.fromRunId)
      if (run.status !== RUN_STATUS.COMPLETED) {
        throw new ConvexError("source run must be completed")
      }
      const outputPath = (run.output || "").trim()
      if (!outputPath) {
        throw new ConvexError("source run has no output artifacts")
      }
      const modelPath = normalizeProjectSubpath(args.modelPath || serveSnapshot.defaultModelPath, "model_path")
      const relativeArtifactPrefix = resolveRunArtifactSnapshotPrefix(modelPath, run.outputDir || env.outputDir)
      const sourcePrefix = relativeArtifactPrefix ? `${outputPath}/${relativeArtifactPrefix}` : outputPath
      const matchingKeys = (run.artifactKeys || [])
        .filter((key) => key === sourcePrefix || key.startsWith(`${sourcePrefix}/`))
        .sort((a, b) => a.localeCompare(b))
      if (matchingKeys.length === 0) {
        throw new ConvexError("source run has no artifacts under the selected model path")
      }

      sourceType = "run"
      sourceRunId = String(run._id)
      sourceModelPath = modelPath
      sourceEntries = matchingKeys.map((key) => ({
        source_key: key,
        relative_path: relativePathFromPrefixedKey(key, sourcePrefix),
        size: 0,
      }))
    } else {
      const objectPrefix = normalizeStoragePrefix(args.fromStoragePrefix || "")
      const storageRows = await ctx.db
        .query("storageObjects")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect()
      const matchingRows = storageRows
        .filter((row) => row.key === objectPrefix || row.key.startsWith(`${objectPrefix}/`))
        .sort((a, b) => a.key.localeCompare(b.key))
      if (matchingRows.length === 0) {
        throw new ConvexError("storage prefix has no objects")
      }

      sourceType = "storage"
      sourceObjectPrefix = objectPrefix
      sourceEntries = matchingRows.map((row) => ({
        source_key: row.key,
        relative_path: relativePathFromPrefixedKey(row.key, objectPrefix),
        size: row.size,
      }))
    }

    return {
      environment_id: String(args.environmentId),
      command: serveSnapshot.command,
      output_dir: env.outputDir,
      code_manifest_hash: env.latestCodeManifestHash,
      data_manifest_hash: env.latestDataManifestHash || null,
      python_version: serveSnapshot.pythonVersion,
      gpu_type: serveSnapshot.gpuType,
      gpu_count: serveSnapshot.gpuCount,
      volume_gb: serveSnapshot.volumeGb,
      port: serveSnapshot.port,
      health_path: serveSnapshot.healthPath,
      default_model_path: serveSnapshot.defaultModelPath,
      startup_timeout_seconds: serveSnapshot.startupTimeoutSeconds,
      health_interval_seconds: serveSnapshot.healthIntervalSeconds,
      health_timeout_seconds: serveSnapshot.healthTimeoutSeconds,
      health_failure_threshold: serveSnapshot.healthFailureThreshold,
      graceful_shutdown_seconds: serveSnapshot.gracefulShutdownSeconds,
      source_type: sourceType,
      source_run_id: sourceRunId,
      source_object_prefix: sourceObjectPrefix,
      source_model_path: sourceModelPath,
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
    const objectPrefix = createSnapshotPrefix(preparation.environment_id)
    const copiedKeys: string[] = []
    let totalBytes = 0

    try {
      for (const entry of preparation.source_entries) {
        const targetKey = `${objectPrefix}/${entry.relative_path}`
        await r2.client.send(
          new CopyObjectCommand({
            Bucket: r2.config.bucket,
            CopySource: buildCopySource(entry.source_key),
            Key: targetKey,
            MetadataDirective: "COPY",
          }),
        )
        await r2.syncMetadata(ctx, targetKey)
        const metadata = await r2.getMetadata(ctx, targetKey)
        copiedKeys.push(targetKey)
        totalBytes += typeof metadata?.size === "number" && Number.isFinite(metadata.size) ? metadata.size : entry.size
      }

      return await ctx.runMutation(internal.serves.internalInsertCreatedServe, {
        userId: args.userId,
        environmentId: args.environmentId,
        command: preparation.command,
        outputDir: preparation.output_dir,
        codeManifestHash: preparation.code_manifest_hash,
        dataManifestHash: preparation.data_manifest_hash || undefined,
        pythonVersion: preparation.python_version,
        gpuType: preparation.gpu_type,
        gpuCount: preparation.gpu_count,
        volumeGb: preparation.volume_gb,
        port: preparation.port,
        healthPath: preparation.health_path,
        defaultModelPath: preparation.default_model_path,
        startupTimeoutSeconds: preparation.startup_timeout_seconds,
        healthIntervalSeconds: preparation.health_interval_seconds,
        healthTimeoutSeconds: preparation.health_timeout_seconds,
        healthFailureThreshold: preparation.health_failure_threshold,
        gracefulShutdownSeconds: preparation.graceful_shutdown_seconds,
        modelSnapshot: {
          sourceType: preparation.source_type,
          sourceRunId:
            preparation.source_type === "run" && preparation.source_run_id
              ? (preparation.source_run_id as Id<"runs">)
              : undefined,
          sourceObjectPrefix: preparation.source_object_prefix || undefined,
          sourceModelPath: preparation.source_model_path || undefined,
          objectPrefix,
          objectCount: preparation.source_entries.length,
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
    command: v.array(v.string()),
    outputDir: v.string(),
    codeManifestHash: v.string(),
    dataManifestHash: v.optional(v.string()),
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
    modelSnapshot: v.object({
      sourceType: v.union(v.literal("run"), v.literal("storage")),
      sourceRunId: v.optional(v.id("runs")),
      sourceObjectPrefix: v.optional(v.string()),
      sourceModelPath: v.optional(v.string()),
      objectPrefix: v.string(),
      objectCount: v.number(),
      totalBytes: v.number(),
    }),
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

export const internalGetRuntimeBootstrapPlan = internalQuery({
  args: { serveId: v.id("serves") },
  returns: runtimeBootstrapPlanValidator,
  handler: async (ctx, args): Promise<RuntimeBootstrapPlan> => {
    const row = await ctx.db.get("serves", args.serveId)
    if (!row) {
      throw new ConvexError("serve not found")
    }
    return {
      serve_id: String(row._id),
      contract_version: "serve.v1",
      environment_id: String(row.environmentId),
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
