import type { Doc, Id } from "@convex/_generated/dataModel"
import type { QueryCtx } from "@convex/_generated/server"
import { RUN_CONFIG } from "@convex/appConfig"

const BOOTSTRAP_LOG_SOURCE = "bootstrap"
const RUNTIME_LOG_TAIL_LIMIT = RUN_CONFIG.runtimeLogTailLimit
const RUNTIME_LOG_STARTUP_SCAN_LIMIT = RUN_CONFIG.runtimeLogStartupScanLimit
const RUNTIME_LOG_PINNED_BOOTSTRAP_LIMIT = RUN_CONFIG.runtimeLogPinnedBootstrapLimit

function toServeModelSourceResponse(row: Doc<"serves">) {
  if (row.modelSource.type === "run") {
    return {
      type: "run" as const,
      run_id: String(row.modelSource.runId),
      model_path: row.modelSource.modelPath,
    }
  }
  return {
    type: "storage" as const,
    object_prefix: row.modelSource.objectPrefix,
  }
}

export function toServeResponse(row: Doc<"serves">) {
  return {
    serve_id: String(row._id),
    created_at: row._creationTime,
    environment_id: String(row.environmentId),
    command: row.command,
    output_dir: row.outputDir,
    logs: row.logs,
    status: row.status,
    error: row.error || "",
    pod_id: row.podId || "",
    code_manifest_hash: row.codeManifestHash || "",
    data_manifest_hash: row.dataManifestHash || "",
    python_version: row.pythonVersion,
    gpu_type: row.gpuType,
    gpu_count: row.gpuCount,
    volume_gb: row.volumeGb,
    port: row.port,
    health_path: row.healthPath,
    default_model_path: row.defaultModelPath,
    startup_timeout_seconds: row.startupTimeoutSeconds,
    health_interval_seconds: row.healthIntervalSeconds,
    health_timeout_seconds: row.healthTimeoutSeconds,
    health_failure_threshold: row.healthFailureThreshold,
    graceful_shutdown_seconds: row.gracefulShutdownSeconds,
    model_source: toServeModelSourceResponse(row),
  }
}

export async function listByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("serves")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect()
  return {
    serves: rows.map((row) => toServeResponse(row)),
  }
}

export async function listRecentRuntimeLogs(
  ctx: QueryCtx,
  serveId: Id<"serves">,
  opts?: { tailLimit?: number; startupScanLimit?: number },
) {
  const tailLimit = opts?.tailLimit ?? RUNTIME_LOG_TAIL_LIMIT
  const startupScanLimit = opts?.startupScanLimit ?? RUNTIME_LOG_STARTUP_SCAN_LIMIT
  const [tailRowsDesc, startupRowsAsc] = await Promise.all([
    ctx.db
      .query("serveRuntimeLogs")
      .withIndex("by_serve", (q) => q.eq("serveId", serveId))
      .order("desc")
      .take(tailLimit),
    ctx.db
      .query("serveRuntimeLogs")
      .withIndex("by_serve", (q) => q.eq("serveId", serveId))
      .order("asc")
      .take(startupScanLimit),
  ])
  const pinnedBootstrapRows = startupRowsAsc
    .filter((row) => row.source === BOOTSTRAP_LOG_SOURCE)
    .slice(0, RUNTIME_LOG_PINNED_BOOTSTRAP_LIMIT)

  const mergedById = new Map<string, Doc<"serveRuntimeLogs">>()
  for (const row of tailRowsDesc) {
    mergedById.set(String(row._id), row)
  }
  for (const row of pinnedBootstrapRows) {
    mergedById.set(String(row._id), row)
  }

  const rows = Array.from(mergedById.values()).sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
    if (a._creationTime !== b._creationTime) return a._creationTime - b._creationTime
    return String(a._id).localeCompare(String(b._id))
  })

  return {
    logs: rows.map((row) => ({
      timestamp: row.timestamp,
      level: row.level,
      source: row.source,
      message: row.message,
    })),
    window: {
      tail_limit: tailLimit,
      startup_scan_limit: startupScanLimit,
      pinned_bootstrap_limit: RUNTIME_LOG_PINNED_BOOTSTRAP_LIMIT,
      scanned_tail: tailRowsDesc.length,
      scanned_startup: startupRowsAsc.length,
      pinned_bootstrap_count: pinnedBootstrapRows.length,
      returned_logs: rows.length,
      includes_pinned_bootstrap: pinnedBootstrapRows.length > 0,
    },
  }
}

export async function toServeLogsResponse(ctx: QueryCtx, row: Doc<"serves">) {
  const recentLogs = await listRecentRuntimeLogs(ctx, row._id)
  return {
    serve_id: String(row._id),
    status: row.status,
    logs_path: row.logs,
    log_file: `${row.logs}/serve.log`,
    note: "Runtime logs are streamed by the serve runtime and persisted in Convex.",
    logs_window: recentLogs.window,
    recent_logs: recentLogs.logs,
  }
}
