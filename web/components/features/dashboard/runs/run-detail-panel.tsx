"use client"

import { ChevronDown, ChevronUp, X } from "lucide-react"
import { useState } from "react"

import {
  metricSeries,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
  type RunRow,
} from "@/components/features/dashboard-model"
import { MetricSection } from "@/components/features/dashboard/runs/metric-section"
import { RunActionsMenu } from "@/components/features/dashboard/runs/run-actions-menu"
import { Badge, statusVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Notice } from "@/components/ui/notice"
import { StatusDot } from "@/components/ui/status-dot"

type RunDetailPanelProps = {
  runDetail: RunDetail
  runLogs: RunLogsOnlyDetail | undefined
  runMetrics: RunMetricsOnlyDetail | undefined
  busy: boolean
  onSelectRun: (id: string | null) => void
  onCancelRun: (id: RunRow["run_id"]) => void
  onDeleteRuns: (ids: RunRow["run_id"][]) => Promise<void>
  onShareRun?: (id: string) => void
}

function RunDetailPanel({
  runDetail,
  runLogs,
  runMetrics,
  busy,
  onSelectRun,
  onCancelRun,
  onDeleteRuns,
  onShareRun,
}: RunDetailPanelProps) {
  const [showContext, setShowContext] = useState(false)
  const series = metricSeries(runMetrics)
  const primarySeries = series.filter((m) => m.category !== "system")
  const systemSeries = series.filter((m) => m.category === "system")

  return (
    <Card variant="dashboard-surface" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <StatusDot variant={runDetail.status as Parameters<typeof StatusDot>[0]["variant"]} size="md" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-foreground">
              {runDetail.name || "Untitled run"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {new Date(runDetail.created_at).toLocaleString()}
            </p>
          </div>
          <Badge variant={statusVariant(runDetail.status)} className="shrink-0 capitalize">
            {runDetail.status}
          </Badge>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <RunActionsMenu
            run={runDetail}
            busy={busy}
            triggerVariant="dashboard-icon-secondary"
            onSelectRun={onSelectRun}
            onCancelRun={onCancelRun}
            onDeleteRuns={onDeleteRuns}
            onShareRun={onShareRun}
          />
          <Button
            type="button"
            variant="dashboard-icon-secondary"
            size="none"
            onClick={() => onSelectRun(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Error */}
      {runDetail.error ? (
        <div className="mx-6 mt-3">
          <Notice variant="error">{runDetail.error}</Notice>
        </div>
      ) : null}

      {/* Context toggle */}
      <div className="px-6 py-4">
        <Button
          type="button"
          variant="dashboard-context-toggle"
          size="none"
          onClick={() => setShowContext((prev) => !prev)}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Run context
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Diagnostics, paths, and live logs stay here so the metrics can lead the page.
            </p>
          </div>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            {showContext ? "Hide" : "Show"}
            {showContext ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </Button>
      </div>

      {/* Context: diagnostics + paths + logs */}
      {showContext ? (
        <div className="space-y-3 px-6 pb-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <RunDiagnosticsCard runDetail={runDetail} />
            <RunPathsCard runDetail={runDetail} />
          </div>
          <RunLogsCard runLogs={runLogs} />
        </div>
      ) : null}

      {/* Metrics */}
      <div className="px-6 pb-6">
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Live metrics
          </h3>
          {runMetrics ? (
            <p className="mb-3 text-ui-caption text-muted-foreground">
              Showing {runMetrics.metrics_window.returned_points} points across{" "}
              {runMetrics.metrics_window.returned_series} series (scan{" "}
              {runMetrics.metrics_window.scanned_points}/{runMetrics.metrics_window.scan_limit}).
              {runMetrics.metrics_window.dropped_series_count > 0
                ? ` ${runMetrics.metrics_window.dropped_series_count} series omitted by window limits.`
                : ""}
            </p>
          ) : null}
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
    </Card>
  )
}

// ─── Context sub-panels ────────────────────────────────────────────────────────

function RunDiagnosticsCard({ runDetail }: { runDetail: RunDetail }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Diagnostics
      </h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Environment</dt>
          <dd className="truncate font-mono text-xs text-foreground">{runDetail.environment_id}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Pod ID</dt>
          <dd className="font-mono text-xs text-foreground">{runDetail.pod_id || "—"}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Infra</dt>
          <dd className="text-xs text-foreground">
            {runDetail.effective_gpu_type || "-"} x{runDetail.effective_gpu_count || "-"} ·{" "}
            {runDetail.effective_volume_gb || "-"}GB
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
  )
}

function RunPathsCard({ runDetail }: { runDetail: RunDetail }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Paths
      </h3>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Input</dt>
          <dd className="break-all font-mono text-xs text-foreground">{runDetail.input || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Output</dt>
          <dd className="break-all font-mono text-xs text-foreground">{runDetail.output || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Logs</dt>
          <dd className="break-all font-mono text-xs text-foreground">{runDetail.logs || "—"}</dd>
        </div>
      </dl>
    </div>
  )
}

function RunLogsCard({ runLogs }: { runLogs: RunLogsOnlyDetail | undefined }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Live logs
      </h3>
      {runLogs ? (
        <div className="mb-3 space-y-1">
          <p className="text-xs text-muted-foreground">{runLogs.note}</p>
          <p className="text-ui-caption text-muted-foreground">
            Showing {runLogs.logs_window.returned_logs} logs (tail {runLogs.logs_window.tail_limit}
            {runLogs.logs_window.includes_pinned_bootstrap
              ? ` + ${runLogs.logs_window.pinned_bootstrap_count} pinned bootstrap`
              : ""}
            ).
          </p>
        </div>
      ) : null}
      <div className="max-h-80 space-y-1 overflow-y-auto rounded border border-border bg-background p-2 font-mono text-xs">
        {!runLogs || runLogs.recent_logs.length === 0 ? (
          <p className="text-muted-foreground">No runtime logs yet.</p>
        ) : (
          runLogs.recent_logs.map((line, index) => (
            <p key={`${line.timestamp}-${index}`} className="break-words">
              <span className="text-muted-foreground">
                [{new Date(line.timestamp).toLocaleTimeString()}]
              </span>{" "}
              <span className="text-muted-foreground">{line.level || "info"}</span>{" "}
              <span className="text-muted-foreground">{line.source || "runtime"}</span>{" "}
              {line.message}
            </p>
          ))
        )}
      </div>
    </div>
  )
}

export { RunDetailPanel }
