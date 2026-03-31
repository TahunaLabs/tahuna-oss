import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery } from "@convex/_generated/server"
import { getAccessibleServe } from "@convex/servesAccess"
import { SERVE_STATUS, TERMINAL_SERVE_STATUSES } from "@convex/servesConstants"
import { createServeForUserId, stopServeForUserId } from "@convex/servesLifecycle"
import { listByUserId, toServeLogsResponse, toServeResponse } from "@convex/servesRead"

const serveModelSourceResponseValidator = v.union(
  v.object({
    type: v.literal("run"),
    run_id: v.string(),
    model_path: v.string(),
  }),
  v.object({
    type: v.literal("storage"),
    object_prefix: v.string(),
  }),
)

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
  model_source: serveModelSourceResponseValidator,
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
  model_source: serveModelSourceResponseValidator,
})

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

export const internalCreate = internalMutation({
  args: {
    userId: v.string(),
    environmentId: v.id("environments"),
    fromRunId: v.optional(v.id("runs")),
    fromStoragePrefix: v.optional(v.string()),
    modelPath: v.optional(v.string()),
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
  handler: async (ctx, args) => {
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
      model_source: toServeResponse(row).model_source,
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
