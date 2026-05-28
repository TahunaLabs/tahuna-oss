import type { Doc, Id } from "@convex/_generated/dataModel";
import type { QueryCtx } from "@convex/_generated/server";
import { RUN_CONFIG } from "@convex/appConfig";
import { resolveRunUptimeMs, toUnixMillis } from "@convex/core/runTiming";
import { TERMINAL_STATUSES } from "@convex/runsConstants";
import { getRunName } from "@convex/runsNaming";

const BOOTSTRAP_LOG_SOURCE = "bootstrap";
const RUNTIME_LOG_TAIL_LIMIT = RUN_CONFIG.runtimeLogTailLimit;
const RUNTIME_LOG_REACTIVE_TAIL_LIMIT = RUN_CONFIG.runtimeLogReactiveTailLimit;
const RUNTIME_LOG_STARTUP_SCAN_LIMIT = RUN_CONFIG.runtimeLogStartupScanLimit;
const RUNTIME_LOG_REACTIVE_STARTUP_SCAN_LIMIT = RUN_CONFIG.runtimeLogReactiveStartupScanLimit;
const RUNTIME_LOG_PINNED_BOOTSTRAP_LIMIT = RUN_CONFIG.runtimeLogPinnedBootstrapLimit;
const RUNTIME_METRIC_SCAN_LIMIT = RUN_CONFIG.runtimeMetricScanLimit;
const RUNTIME_METRIC_SERIES_LIMIT = RUN_CONFIG.runtimeMetricSeriesLimit;
const RUNTIME_METRIC_PER_SERIES_LIMIT = RUN_CONFIG.runtimeMetricPerSeriesLimit;

export function toRunResponse(row: Doc<"runs">) {
  return {
    run_id: String(row._id),
    name: getRunName(row),
    created_at: toUnixMillis(row._creationTime),
    uptime_ms: resolveRunUptimeMs(row, TERMINAL_STATUSES),
    environment_id: String(row.environmentId),
    input: row.input,
    output: row.output,
    logs: row.logs,
    status: row.status,
    error: row.error || "",
    compute_session_id: row.computeSessionId ? String(row.computeSessionId) : "",
    compute_session_idle_expires_at: 0,
    execution_mode: row.executionMode || "ephemeral",
    provider_machine_id: row.providerMachineId || "",
    effective_gpu_type: row.effectiveGpuType || "",
    effective_gpu_count: row.effectiveGpuCount || 0,
    effective_volume_gb: row.effectiveVolumeGb || 0,
    code_manifest_hash: row.codeManifestHash || "",
    data_manifest_hash: row.dataManifestHash || "",
    cancellation_requested: row.cancellationRequested,
    artifact_keys: row.artifactKeys || [],
  };
}

export async function toRunResponseWithComputeSession(ctx: QueryCtx, row: Doc<"runs">) {
  const response = toRunResponse(row);
  if (!row.computeSessionId) {
    return response;
  }

  const session = await ctx.db.get(row.computeSessionId);
  if (!session || session.status !== "idle" || !session.lastIdleAt) {
    return response;
  }

  return {
    ...response,
    compute_session_idle_expires_at: session.lastIdleAt + session.idleTimeoutSeconds * 1000,
  };
}

export async function listByUserId(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .collect();
  return {
    runs: rows.map((row) => toRunResponse(row)),
  };
}

export async function listRecentRuntimeLogs(
  ctx: QueryCtx,
  runId: Id<"runs">,
  opts?: { tailLimit?: number; startupScanLimit?: number },
) {
  const tailLimit = opts?.tailLimit ?? RUNTIME_LOG_TAIL_LIMIT;
  const startupScanLimit = opts?.startupScanLimit ?? RUNTIME_LOG_STARTUP_SCAN_LIMIT;
  const [tailRowsDesc, startupRowsAsc] = await Promise.all([
    ctx.db
      .query("runRuntimeLogs")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("desc")
      .take(tailLimit),
    ctx.db
      .query("runRuntimeLogs")
      .withIndex("by_run", (q) => q.eq("runId", runId))
      .order("asc")
      .take(startupScanLimit),
  ]);
  const pinnedBootstrapRows = startupRowsAsc
    .filter((row) => row.source === BOOTSTRAP_LOG_SOURCE)
    .slice(0, RUNTIME_LOG_PINNED_BOOTSTRAP_LIMIT);

  const mergedById = new Map<string, Doc<"runRuntimeLogs">>();
  for (const row of tailRowsDesc) {
    mergedById.set(String(row._id), row);
  }
  for (const row of pinnedBootstrapRows) {
    mergedById.set(String(row._id), row);
  }

  const rows = Array.from(mergedById.values()).sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a._creationTime !== b._creationTime) return a._creationTime - b._creationTime;
    return String(a._id).localeCompare(String(b._id));
  });

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
  };
}

export async function listRecentRuntimeMetrics(ctx: QueryCtx, runId: Id<"runs">) {
  const scannedRowsDesc = await ctx.db
    .query("runRuntimeMetrics")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .order("desc")
    .take(RUNTIME_METRIC_SCAN_LIMIT);

  const grouped = new Map<string, Array<Doc<"runRuntimeMetrics">>>();
  for (const row of scannedRowsDesc) {
    const key = `${row.source}:${row.name}`;
    const points = grouped.get(key) || [];
    points.push(row);
    grouped.set(key, points);
  }

  const groupedEntries = Array.from(grouped.entries());
  const selectedEntries = groupedEntries.slice(0, RUNTIME_METRIC_SERIES_LIMIT);
  const selectedRows: Array<Doc<"runRuntimeMetrics">> = [];
  for (const [, points] of selectedEntries) {
    selectedRows.push(...points.slice(0, RUNTIME_METRIC_PER_SERIES_LIMIT));
  }

  selectedRows.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    if (a._creationTime !== b._creationTime) return a._creationTime - b._creationTime;
    return String(a._id).localeCompare(String(b._id));
  });

  const droppedSeriesCount = Math.max(0, groupedEntries.length - selectedEntries.length);
  const totalScannedPoints = scannedRowsDesc.length;
  const droppedPointsCount = Math.max(0, totalScannedPoints - selectedRows.length);

  return {
    metrics: selectedRows.map((row) => ({
      timestamp: row.timestamp,
      name: row.name,
      value: row.value,
      step: row.step ?? null,
      unit: row.unit ?? null,
      source: row.source,
    })),
    window: {
      scan_limit: RUNTIME_METRIC_SCAN_LIMIT,
      series_limit: RUNTIME_METRIC_SERIES_LIMIT,
      per_series_limit: RUNTIME_METRIC_PER_SERIES_LIMIT,
      scanned_points: scannedRowsDesc.length,
      scanned_series: groupedEntries.length,
      returned_series: selectedEntries.length,
      returned_points: selectedRows.length,
      dropped_series_count: droppedSeriesCount,
      dropped_points_count: droppedPointsCount,
    },
  };
}

function compareFinalMetricRows(a: Doc<"runRuntimeMetrics">, b: Doc<"runRuntimeMetrics">) {
  const aHasStep = typeof a.step === "number";
  const bHasStep = typeof b.step === "number";
  if (aHasStep !== bHasStep) return aHasStep ? -1 : 1;
  if (aHasStep && bHasStep && a.step !== b.step) return (b.step ?? 0) - (a.step ?? 0);
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
  if (a._creationTime !== b._creationTime) return b._creationTime - a._creationTime;
  return String(b._id).localeCompare(String(a._id));
}

export async function resolveFinalRuntimeMetric(ctx: QueryCtx, runId: Id<"runs">, name: string) {
  const rows = await ctx.db
    .query("runRuntimeMetrics")
    .withIndex("by_run_and_name", (q) => q.eq("runId", runId).eq("name", name))
    .collect();
  if (rows.length === 0) {
    return null;
  }

  const trainRows = rows.filter((row) => row.source === "train");
  const candidates = trainRows.length > 0 ? trainRows : rows;
  candidates.sort(compareFinalMetricRows);
  const row = candidates[0];
  return {
    run_id: String(row.runId),
    name: row.name,
    value: row.value,
    step: row.step ?? null,
    timestamp: row.timestamp,
    source: row.source,
  };
}

export async function toRunLogsResponse(ctx: QueryCtx, row: Doc<"runs">) {
  const [recentLogs, recentMetrics] = await Promise.all([
    listRecentRuntimeLogs(ctx, row._id),
    listRecentRuntimeMetrics(ctx, row._id),
  ]);
  return {
    run_id: String(row._id),
    status: row.status,
    logs_path: row.logs,
    log_file: `${row.logs}/run.log`,
    note: "Runtime logs/metrics are streamed by the machine and persisted in Convex.",
    logs_window: recentLogs.window,
    metrics_window: recentMetrics.window,
    recent_logs: recentLogs.logs,
    recent_metrics: recentMetrics.metrics,
  };
}

export async function toRunLogsOnlyResponse(ctx: QueryCtx, row: Doc<"runs">) {
  const recentLogs = await listRecentRuntimeLogs(ctx, row._id, {
    tailLimit: RUNTIME_LOG_REACTIVE_TAIL_LIMIT,
    startupScanLimit: RUNTIME_LOG_REACTIVE_STARTUP_SCAN_LIMIT,
  });
  return {
    run_id: String(row._id),
    status: row.status,
    logs_path: row.logs,
    log_file: `${row.logs}/run.log`,
    note: "Runtime logs are streamed by the machine and persisted in Convex.",
    logs_window: recentLogs.window,
    recent_logs: recentLogs.logs,
  };
}

export async function toRunMetricsOnlyResponse(ctx: QueryCtx, row: Doc<"runs">) {
  const recentMetrics = await listRecentRuntimeMetrics(ctx, row._id);
  return {
    run_id: String(row._id),
    status: row.status,
    metrics_window: recentMetrics.window,
    recent_metrics: recentMetrics.metrics,
  };
}
