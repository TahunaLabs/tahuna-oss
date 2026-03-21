"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, Play, Trash2, X, Share2, Users } from "lucide-react"
import { DashboardViewLayout } from "@/components/app-shell/layout-shell"
import { MetricSection } from "@/components/features/dashboard/runs/metric-section"
import { RunTabButton } from "@/components/features/dashboard/runs/run-tab-button"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import {
  CANCELLABLE_STATUSES,
  metricSeries,
  relativeTime,
  type EnvironmentRow,
  type RunRow,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
} from "@/components/features/dashboard-model"

type RunsViewProps = {
  creditsLabel: string
  environments: EnvironmentRow[]
  runs: RunRow[]
  busy: boolean
  activeTab: RunTab
  selectedRunId: string | null
  runDetail: RunDetail | undefined
  runLogs: RunLogsOnlyDetail | undefined
  runMetrics: RunMetricsOnlyDetail | undefined
  onActiveTabChange: (tab: RunTab) => void
  onSelectRun: (runId: string | null) => void
  onCancelRun: (runId: RunRow["run_id"]) => void
  onDeleteRuns: (runIds: RunRow["run_id"][]) => Promise<void>
  sharedByMeResourceIds?: ReadonlySet<string>
  onShareRun?: (runId: string) => void
}

export type RunTab = "all" | "active" | "completed"

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
  creditsLabel,
  environments,
  runs,
  busy,
  activeTab,
  selectedRunId,
  runDetail,
  runLogs,
  runMetrics,
  onActiveTabChange,
  onSelectRun,
  onCancelRun,
  onDeleteRuns,
  sharedByMeResourceIds,
  onShareRun,
}: RunsViewProps) {
  const [showRunContext, setShowRunContext] = useState(false)
  const environmentNameById = useMemo(
    () => new Map(environments.map((environment) => [String(environment.environment_id), environment.name])),
    [environments],
  )

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
    <DashboardViewLayout
      sectionLabel="Runs"
      title="Runs"
      titleIcon={<Play size={24} />}
      count={runs.length > 0 ? runs.length : undefined}
      creditsLabel={creditsLabel}
      toolbar={(
        <div className="flex items-center gap-1.5">
          <RunTabButton label="All runs" active={activeTab === "all"} onClick={() => onActiveTabChange("all")} />
          <RunTabButton
            label="Active"
            active={activeTab === "active"}
            onClick={() => onActiveTabChange("active")}
            count={runs.filter((r) => ACTIVE_STATUSES.has(r.status)).length}
          />
          <RunTabButton
            label="Completed"
            active={activeTab === "completed"}
            onClick={() => onActiveTabChange("completed")}
          />
        </div>
      )}
    >

      {/* Content */}
      {noEnvironments ? (
        <div>
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mb-6 flex justify-center">
                <Play className="h-16 w-16 text-muted-foreground/50" strokeWidth={1} />
              </div>
              <h2 className="mb-3 text-lg font-medium text-foreground">Runs</h2>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                Create an environment first to launch runs. Run <code className="rounded bg-secondary px-1 py-0.5 text-xs">tahuna init .</code> from your project folder.
              </p>
            </div>
          </div>
        </div>
      ) : !hasData ? (
        <div>
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mb-6 flex justify-center">
                <Play className="h-16 w-16 text-muted-foreground/50" strokeWidth={1} />
              </div>
              <h2 className="mb-3 text-lg font-medium text-foreground">Runs</h2>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                {activeTab !== "all"
                  ? `No ${activeTab} runs.`
                  : "View and manage your workflow runs. Track builds, deployments, and automated tasks across all your projects."}
              </p>
              {activeTab === "all" && (
                <div className="flex items-center justify-center gap-3">
                  <Button type="button" variant="dashboard-primary-compact" size="none">
                    Trigger run
                    <kbd className="rounded bg-accent-foreground/20 px-1.5 py-0.5 text-xs">N</kbd>
                    <span className="text-xs opacity-70">then</span>
                    <kbd className="rounded bg-accent-foreground/20 px-1.5 py-0.5 text-xs">R</kbd>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="h-full overflow-auto rounded-lg border border-border bg-background">
            <Table variant="dashboard" className="table-fixed">
              <colgroup>
                <col className="w-[300px]" />
                <col className="w-[120px]" />
                <col className="w-[220px]" />
                <col className="w-[140px]" />
                <col className="w-[130px]" />
                <col className="w-[40px]" />
              </colgroup>
              <TableHeader variant="dashboard" className="sticky top-0 bg-background">
                <TableRow variant="dashboard-head" className="text-left">
                  <TableHead variant="dashboard">Name</TableHead>
                  <TableHead variant="dashboard">Status</TableHead>
                  <TableHead variant="dashboard">Environment</TableHead>
                  <TableHead variant="dashboard">Started</TableHead>
                  <TableHead variant="dashboard">Runtime</TableHead>
                  <TableHead variant="dashboard" className="px-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => {
                  const runLabel = run.name || "Untitled run"
                  const environmentLabel = environmentNameById.get(run.environment_id) || "Unknown environment"
                  const selected = selectedRunId === run.run_id
                  return (
                    <TableRow
                      key={run.run_id}
                      variant="dashboard"
                      className={cn(
                        "group cursor-pointer align-middle hover:bg-secondary/50",
                        selected ? "bg-secondary/30" : "",
                      )}
                      onClick={() => onSelectRun(selected ? null : run.run_id)}
                    >
                      <TableCell variant="dashboard" className="text-foreground">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate">{runLabel}</p>
                          {sharedByMeResourceIds?.has(run.run_id) ? (
                            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell variant="dashboard" className="text-muted-foreground">
                        <span className="inline-flex items-center gap-2 capitalize">
                          <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[run.status] || "bg-muted-foreground")} />
                          {run.status}
                        </span>
                      </TableCell>
                      <TableCell variant="dashboard" className="text-muted-foreground">
                        <p className="truncate">{environmentLabel}</p>
                      </TableCell>
                      <TableCell variant="dashboard" className="text-muted-foreground">
                        {run.created_at > 0 ? relativeTime(run.created_at) : "—"}
                      </TableCell>
                      <TableCell variant="dashboard" className="text-muted-foreground">
                        {formatRunUptime(run.uptime_ms)}
                      </TableCell>
                      <TableCell
                        variant="dashboard"
                        className="px-0 align-middle"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="flex items-center justify-center">
                          <ActionsMenu triggerLabel={`Open actions for ${runLabel}`}>
                            {(close) => (
                              <>
                                {onShareRun ? (
                                  <Button
                                    type="button"
                                    variant="sidebar-menu-item"
                                    size="none"
                                    onClick={() => {
                                      close()
                                      onShareRun(run.run_id)
                                    }}
                                  >
                                    <Share2 className="w-3.5 h-3.5" />
                                    Share
                                  </Button>
                                ) : null}
                                {CANCELLABLE_STATUSES.has(run.status) ? (
                                  <Button
                                    type="button"
                                    variant="sidebar-menu-item"
                                    size="none"
                                    disabled={busy}
                                    onClick={() => {
                                      close()
                                      onCancelRun(run.run_id)
                                    }}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    Cancel run
                                  </Button>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="sidebar-menu-item"
                                  size="none"
                                  disabled={busy}
                                  onClick={() => {
                                    close()
                                    void onDeleteRuns([run.run_id]).then(() => {
                                      if (selectedRunId === run.run_id) {
                                        onSelectRun(null)
                                      }
                                    })
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete run
                                </Button>
                              </>
                            )}
                          </ActionsMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {selectedRunId === null ? null : !runDetail ? (
            <div className="rounded-lg border border-border bg-background px-6 py-10">
              <p className="text-sm text-muted-foreground">Loading run details…</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
                {/* Detail header */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-border">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", STATUS_DOT[runDetail.status] || "bg-muted-foreground")} />
                    <div className="min-w-0">
                      <h2 className="text-sm font-medium text-foreground truncate">
                        {runDetail.name || "Untitled run"}
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
                    <ActionsMenu triggerLabel="Open run actions" triggerVariant="dashboard-icon-secondary">
                      {(close) => (
                        <>
                          {onShareRun && (
                            <Button
                              type="button"
                              variant="sidebar-menu-item"
                              size="none"
                              onClick={() => {
                                close()
                                onShareRun(runDetail.run_id)
                              }}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              Share
                            </Button>
                          )}
                          {CANCELLABLE_STATUSES.has(runDetail.status) && (
                            <Button
                              type="button"
                              variant="sidebar-menu-item"
                              size="none"
                              disabled={busy}
                              onClick={() => {
                                close()
                                onCancelRun(runDetail.run_id as RunRow["run_id"])
                              }}
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancel run
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="sidebar-menu-item"
                            size="none"
                            disabled={busy}
                            onClick={() => {
                              close()
                              void onDeleteRuns([runDetail.run_id as RunRow["run_id"]]).then(() => {
                                onSelectRun(null)
                              })
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete run
                          </Button>
                        </>
                      )}
                    </ActionsMenu>
                    <Button
                      type="button"
                      variant="dashboard-icon-secondary"
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
                          <p className="text-ui-caption text-muted-foreground">
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
                      <p className="mb-3 text-ui-caption text-muted-foreground">
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
      )}
    </DashboardViewLayout>
  )
}

function formatRunUptime(uptimeMs: number) {
  if (!Number.isFinite(uptimeMs) || uptimeMs <= 0) {
    return "—"
  }
  const totalSeconds = Math.floor(uptimeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}
