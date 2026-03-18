"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Play, Plus, Filter, Settings2, LayoutGrid, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  CANCELLABLE_STATUSES,
  metricSeries,
  relativeTime,
  type EnvironmentRow,
  type RunRow,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
} from "@/components/dashboard/shared"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type RunsViewProps = {
  environments: EnvironmentRow[]
  runs: RunRow[]
  busy: boolean
  selectedRunId: string | null
  runDetail: RunDetail | undefined
  runLogs: RunLogsOnlyDetail | undefined
  runMetrics: RunMetricsOnlyDetail | undefined
  onSelectRun: (runId: string | null) => void
  onCancelRun: (runId: RunRow["run_id"]) => void
}

type RunTab = "all" | "active" | "completed"

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"])
const COMPLETED_STATUSES = new Set(["completed", "failed", "cancelled"])

const STATUS_DOT: Record<string, string> = {
  queued: "bg-yellow-400",
  provisioning: "bg-blue-400",
  running: "bg-green-400",
  completed: "bg-green-400",
  failed: "bg-red-400",
  cancelled: "bg-muted-foreground",
  cancelling: "bg-orange-400",
}

const STATUS_COLORS: Record<string, string> = {
  queued: "bg-yellow-500/20 text-yellow-400",
  provisioning: "bg-blue-500/20 text-blue-400",
  running: "bg-green-500/20 text-green-400",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
  cancelling: "bg-orange-500/20 text-orange-400",
}

export function RunsView({
  environments,
  runs,
  busy,
  selectedRunId,
  runDetail,
  runLogs,
  runMetrics,
  onSelectRun,
  onCancelRun,
}: RunsViewProps) {
  const [activeTab, setActiveTab] = useState<RunTab>("all")
  const [showRunContext, setShowRunContext] = useState(false)

  const filteredRuns = runs.filter((run) => {
    if (activeTab === "active") return ACTIVE_STATUSES.has(run.status)
    if (activeTab === "completed") return COMPLETED_STATUSES.has(run.status)
    return true
  })

  const hasData = filteredRuns.length > 0
  const noEnvironments = environments.length === 0
  const series = metricSeries(runMetrics)
  const primarySeries = series.filter((metric) => metric.category !== "system")
  const systemSeries = series.filter((metric) => metric.category === "system")

  useEffect(() => {
    setShowRunContext(false)
  }, [selectedRunId])

  return (
    <main className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-foreground">Runs</h1>
          {runs.length > 0 && (
            <span className="text-xs text-muted-foreground">{runs.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="dashboard-icon-secondary" size="none">
            <Filter className="w-4 h-4" />
          </Button>
          <Button type="button" variant="dashboard-icon-secondary" size="none">
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button type="button" variant="dashboard-icon-secondary" size="none">
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button type="button" variant="dashboard-icon-secondary" size="none">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <TabButton label="All runs" active={activeTab === "all"} onClick={() => setActiveTab("all")} />
          <TabButton
            label="Active"
            active={activeTab === "active"}
            onClick={() => setActiveTab("active")}
            count={runs.filter((r) => ACTIVE_STATUSES.has(r.status)).length}
          />
          <TabButton
            label="Completed"
            active={activeTab === "completed"}
            onClick={() => setActiveTab("completed")}
          />
          <Button type="button" variant="dashboard-tab-compact" size="none">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {noEnvironments ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <Play className="w-16 h-16 text-muted-foreground/50" strokeWidth={1} />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-3">Runs</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Create an environment first to launch runs. Run <code className="px-1 py-0.5 bg-secondary rounded text-xs">tahuna init .</code> from your project folder.
            </p>
          </div>
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <Play className="w-16 h-16 text-muted-foreground/50" strokeWidth={1} />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-3">Runs</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {activeTab !== "all"
                ? `No ${activeTab} runs.`
                : "View and manage your workflow runs. Track builds, deployments, and automated tasks across all your projects."}
            </p>
            {activeTab === "all" && (
              <div className="flex items-center justify-center gap-3">
                <Button type="button" variant="dashboard-primary-compact" size="none">
                  Trigger run
                  <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">N</kbd>
                  <span className="text-xs opacity-70">then</span>
                  <kbd className="px-1.5 py-0.5 bg-accent-foreground/20 rounded text-xs">R</kbd>
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Left panel — run list */}
          <div className="w-80 border-r border-border flex flex-col min-h-0 shrink-0">
            <div className="flex-1 overflow-y-auto">
              {filteredRuns.map((run) => (
                <Button
                  type="button"
                  variant={selectedRunId === run.run_id ? "dashboard-run-list-item-active" : "dashboard-run-list-item"}
                  size="none"
                  key={run.run_id}
                  onClick={() => onSelectRun(selectedRunId === run.run_id ? null : run.run_id)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[run.status] || "bg-muted-foreground")} />
                    <span className="text-sm font-medium text-foreground truncate">
                      {run.name || run.run_id}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs text-muted-foreground capitalize">{run.status}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {run.environment_id}
                    </span>
                  </div>
                  {run.created_at > 0 && (
                    <p className="text-xs text-muted-foreground ml-4 mt-0.5">
                      {relativeTime(run.created_at)}
                    </p>
                  )}
                </Button>
              ))}
            </div>
          </div>

          {/* Right panel — run detail */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {selectedRunId === null ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <Play className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" strokeWidth={1} />
                  <p className="text-sm text-muted-foreground">Select a run to view details</p>
                </div>
              </div>
            ) : !runDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading run details…</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {/* Detail header */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", STATUS_DOT[runDetail.status] || "bg-muted-foreground")} />
                    <div className="min-w-0">
                      <h2 className="text-sm font-medium text-foreground truncate">
                        {runDetail.name || runDetail.run_id}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {new Date(runDetail.created_at).toLocaleString()}
                      </p>
                    </div>
                    <span className={cn(
                      "inline-flex px-2 py-0.5 rounded text-xs capitalize shrink-0",
                      STATUS_COLORS[runDetail.status] || "bg-secondary text-foreground"
                    )}>
                      {runDetail.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {CANCELLABLE_STATUSES.has(runDetail.status) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="dashboard-outline-icon-muted"
                            size="none"
                            disabled={busy}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel this run?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Run <code>{runDetail.run_id}</code> will move to cancellation flow.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep running</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onCancelRun(runDetail.run_id as RunRow["run_id"])}
                              disabled={busy}
                            >
                              Cancel run
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Button
                      type="button"
                      variant="dashboard-outline-icon-muted"
                      size="none"
                      onClick={() => onSelectRun(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Error notice */}
                {runDetail.error && (
                  <div className="mx-6 mt-3 px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {runDetail.error}
                  </div>
                )}

                <div className="px-6 py-4">
                  <Button
                    type="button"
                    variant="dashboard-context-toggle"
                    size="none"
                    onClick={() => setShowRunContext((current) => !current)}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Run context</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Diagnostics, paths, and live logs stay here so the metrics can lead the page.
                      </p>
                    </div>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {showRunContext ? "Hide" : "Show"}
                      {showRunContext ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </Button>
                </div>

                {showRunContext && (
                  <div className="space-y-3 px-6 pb-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border p-4">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Diagnostics</h3>
                        <dl className="space-y-2 text-sm">
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Environment</dt>
                            <dd className="font-mono text-xs text-foreground truncate">{runDetail.environment_id}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Pod ID</dt>
                            <dd className="font-mono text-xs text-foreground">{runDetail.pod_id || "—"}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Infra</dt>
                            <dd className="text-xs text-foreground">
                              {runDetail.effective_gpu_type || "-"} x{runDetail.effective_gpu_count || "-"} · {runDetail.effective_volume_gb || "-"}GB
                            </dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Cancel requested</dt>
                            <dd className="text-foreground">{runDetail.cancellation_requested ? "Yes" : "No"}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">Artifacts</dt>
                            <dd className="text-foreground">{runDetail.artifact_keys.length}</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="rounded-lg border border-border p-4">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Paths</h3>
                        <dl className="space-y-2 text-sm">
                          <div>
                            <dt className="text-muted-foreground text-xs">Input</dt>
                            <dd className="font-mono text-xs text-foreground break-all">{runDetail.input || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">Output</dt>
                            <dd className="font-mono text-xs text-foreground break-all">{runDetail.output || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-xs">Logs</dt>
                            <dd className="font-mono text-xs text-foreground break-all">{runDetail.logs || "—"}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border p-4">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Live logs</h3>
                      {runLogs && (
                        <div className="mb-3 space-y-1">
                          <p className="text-xs text-muted-foreground">{runLogs.note}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Showing {runLogs.logs_window.returned_logs} logs (tail {runLogs.logs_window.tail_limit}
                            {runLogs.logs_window.includes_pinned_bootstrap
                              ? ` + ${runLogs.logs_window.pinned_bootstrap_count} pinned bootstrap`
                              : ""}).
                          </p>
                        </div>
                      )}
                      <div className="max-h-[320px] space-y-1 overflow-y-auto rounded border border-border bg-background/50 p-2 font-mono text-xs">
                        {!runLogs || runLogs.recent_logs.length === 0 ? (
                          <p className="text-muted-foreground">No runtime logs yet.</p>
                        ) : (
                          runLogs.recent_logs.map((line, index) => (
                            <p key={`${line.timestamp}-${index}`} className="break-words">
                              <span className="text-muted-foreground">[{new Date(line.timestamp).toLocaleTimeString()}]</span>{" "}
                              <span className="text-muted-foreground">{line.level || "info"}</span>{" "}
                              <span className="text-muted-foreground">{line.source || "runtime"}</span>{" "}
                              {line.message}
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="px-6 pb-6">
                  <div className="rounded-lg border border-border p-4">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Live metrics</h3>
                    {runMetrics && (
                      <p className="mb-3 text-[11px] text-muted-foreground">
                        Showing {runMetrics.metrics_window.returned_points} points across {runMetrics.metrics_window.returned_series} series
                        (scan {runMetrics.metrics_window.scanned_points}/{runMetrics.metrics_window.scan_limit}).
                        {runMetrics.metrics_window.dropped_series_count > 0
                          ? ` ${runMetrics.metrics_window.dropped_series_count} series omitted by window limits.`
                          : ""}
                      </p>
                    )}
                    {series.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No runtime metrics yet.</p>
                    ) : (
                      <div className="space-y-5">
                        <MetricSection
                          title="Model metrics"
                          description="Training and evaluation signals from the run itself."
                          metrics={primarySeries}
                          emptyMessage="No model metrics yet."
                        />
                        <MetricSection
                          title="System metrics"
                          description="Bootstrap, artifact, and runtime system activity."
                          metrics={systemSeries}
                          emptyMessage="No system metrics yet."
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function MetricSection({
  title,
  description,
  metrics,
  emptyMessage,
}: {
  title: string
  description: string
  metrics: ReturnType<typeof metricSeries>
  emptyMessage: string
}) {
  return (
    <section className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
          <span className="text-[11px] text-muted-foreground">{metrics.length} charts</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {metrics.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
          {metrics.map((metric) => (
            <MetricChart key={`${metric.source}:${metric.name}`} metric={metric} />
          ))}
        </div>
      )}
    </section>
  )
}

function MetricChart({
  metric,
}: {
  metric: ReturnType<typeof metricSeries>[number]
}) {
  const sourceVariant =
    metric.category === "model"
      ? "status-success"
      : metric.category === "runtime"
        ? "status-info"
        : "status-warning"

  const values = metric.points.map((point) => point.value)
  const minValue = values.length > 0 ? Math.min(...values) : 0
  const maxValue = values.length > 0 ? Math.max(...values) : 0
  const spread = maxValue - minValue
  const padding =
    spread === 0
      ? Math.max(Math.abs(maxValue) * 0.12, 1)
      : Math.max(spread * 0.2, Math.abs(maxValue) * 0.04)
  const yDomain: [number, number] = [minValue - padding, maxValue + padding]
  const xValues = metric.points.map((point) => point.x)
  const minX = xValues.length > 0 ? Math.min(...xValues) : 0
  const maxX = xValues.length > 0 ? Math.max(...xValues) : 0
  const xSpread = maxX - minX
  const xPadding = xSpread === 0 ? 1 : Math.max(xSpread * 0.04, 1)
  const xDomain: [number, number] = [minX - xPadding, maxX + xPadding]

  return (
    <div className="rounded border border-border p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{metric.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={sourceVariant}>{metric.source}</Badge>
            <span className="text-[11px] text-muted-foreground">{metric.pointCount} point{metric.pointCount === 1 ? "" : "s"}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Latest</p>
          <p className="font-mono text-sm text-foreground">{formatMetricValue(metric.latestValue)}</p>
        </div>
      </div>
      <div className="h-36 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={metric.points}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) =>
                metric.xAxis === "step" ? String(Math.round(value)) : new Date(value).toLocaleTimeString()
              }
              label={{
                value: metric.xAxis === "step" ? "Step" : "Time",
                position: "insideBottomRight",
                offset: -2,
                fill: "var(--muted-foreground)",
                fontSize: 10,
              }}
            />
            <YAxis
              width={56}
              tick={{ fontSize: 10 }}
              domain={yDomain}
              tickFormatter={(value: number) => formatAxisValue(value)}
            />
            <Tooltip
              formatter={(value: number) => formatMetricValue(value)}
              labelFormatter={(value: number) =>
                metric.xAxis === "step" ? `Step ${Math.round(value)}` : new Date(value).toLocaleTimeString()
              }
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={3}
              dot={metric.pointCount <= 4 ? { r: 3, strokeWidth: 0, fill: "var(--accent)" } : false}
              activeDot={{ r: 5, strokeWidth: 0, fill: "var(--accent)" }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function formatMetricValue(value: number) {
  if (!Number.isFinite(value)) {
    return "—"
  }
  const absolute = Math.abs(value)
  if (absolute >= 1000 || absolute === 0) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (absolute >= 1) {
    return value.toFixed(3)
  }
  return value.toPrecision(3)
}

function formatAxisValue(value: number) {
  if (!Number.isFinite(value)) {
    return ""
  }
  const absolute = Math.abs(value)
  if (absolute >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }
  if (absolute >= 1) {
    return value.toFixed(2)
  }
  return value.toPrecision(2)
}

function TabButton({
  label,
  active,
  onClick,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}) {
  return (
    <Button
      type="button"
      variant={active ? "dashboard-tab-compact-active" : "dashboard-tab-compact"}
      size="none"
      onClick={onClick}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs">
          {count}
        </span>
      )}
    </Button>
  )
}
