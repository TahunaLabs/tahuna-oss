"use client"

import {
  Activity,
  Download,
  ExternalLink,
  FileText,
  HardDriveDownload,
  ListChecks,
  Terminal,
} from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"

import {
  formatBytes,
  metricSeries,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
  type StorageItem,
} from "@/components/features/dashboard-model"
import { MetricChart } from "@/components/features/dashboard/runs/metric-chart"
import { RunStatTiles } from "@/components/features/dashboard/runs/run-stat-tiles"
import { Badge, statusVariant } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Notice } from "@/components/ui/notice"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useListDashboardStorage } from "@/lib/dashboard-api"

type RunDetailTab = "overview" | "logs" | "checkpoints" | "system"

const RUN_DETAIL_TABS: Array<{ value: RunDetailTab; label: string; icon: typeof Activity }> = [
  { value: "overview", label: "Overview", icon: Activity },
  { value: "logs", label: "Logs", icon: Terminal },
  { value: "checkpoints", label: "Checkpoints & Artifacts", icon: HardDriveDownload },
  { value: "system", label: "System", icon: ListChecks },
]

type RunDashboardProps = {
  run: RunDetail
  logs: RunLogsOnlyDetail | undefined
  metrics: RunMetricsOnlyDetail | undefined
  environmentLabel?: string
  /** Optional element rendered at the start of the header (e.g. a back button). */
  leading?: ReactNode
  /** Header actions rendered on the right (refresh, close, run actions, …). */
  actions?: ReactNode
}

/**
 * The run dashboard body shared by the standalone run page (new tab) and the
 * inline panel under the runs table. Both render the same tabbed layout; the
 * surrounding chrome (back link, refresh, close, run actions) is passed in via
 * the `leading` and `actions` slots.
 */
export function RunDashboard({
  run,
  logs,
  metrics,
  environmentLabel,
  leading,
  actions,
}: RunDashboardProps) {
  const runId = run.run_id
  const listStorage = useListDashboardStorage()

  const [activeTab, setActiveTab] = useState<RunDetailTab>("overview")
  const [artifacts, setArtifacts] = useState<StorageItem[] | undefined>(undefined)
  const [artifactsError, setArtifactsError] = useState("")

  useEffect(() => {
    let cancelled = false
    setArtifacts(undefined)
    setArtifactsError("")
    void listStorage({
      visibility: "all",
      sort: "created_desc",
      search: runId,
      offset: 0,
      limit: 100,
    })
      .then((result) => {
        if (cancelled) return
        setArtifacts(result.items.filter((item) => item.source === "run_artifact" && item.run?.id === runId))
      })
      .catch((error) => {
        if (cancelled) return
        setArtifacts([])
        setArtifactsError(error instanceof Error ? error.message : "failed to load checkpoints")
      })
    return () => {
      cancelled = true
    }
  }, [listStorage, runId])

  const series = metricSeries(metrics)
  const wandbSeries = series.filter((metric) => metric.source.toLowerCase() === "wandb")
  const systemSeries = series.filter((metric) => metric.category === "system")
  const runtimeSeries = series.filter((metric) => metric.category === "runtime")

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div className="flex min-w-0 items-center gap-3">
          {leading}
          <StatusDot variant={toStatusDotVariant(run.status)} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-foreground">{run.name || "Untitled run"}</h1>
              <Badge variant={statusVariant(run.status)} className="capitalize">
                {run.status}
              </Badge>
            </div>
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>

      {run.error ? <Notice variant="error">{run.error}</Notice> : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as RunDetailTab)} className="gap-0">
        <TabsList className="w-full overflow-x-auto rounded-lg border border-border bg-card p-1">
          {RUN_DETAIL_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="shrink-0">
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <RunStatTiles run={run} environmentLabel={environmentLabel} />

          {wandbSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No W&B metrics yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {wandbSeries.map((metric) => (
                <MetricChart key={`${metric.source}:${metric.name}`} metric={metric} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs">
          <Card variant="surface" className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Runtime logs</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {logs?.note ?? "Runtime logs are streamed by the machine and persisted in Convex."}
                </p>
              </div>
              {logs ? (
                <Badge variant="default">
                  {logs.logs_window.returned_logs} / {logs.logs_window.tail_limit}
                </Badge>
              ) : null}
            </div>
            <div className="mt-4 max-h-96 space-y-1 overflow-y-auto rounded border border-border bg-background p-3 font-mono text-xs">
              {!logs ? (
                <p className="text-muted-foreground">Loading runtime logs…</p>
              ) : logs.recent_logs.length === 0 ? (
                <p className="text-muted-foreground">No runtime logs yet.</p>
              ) : (
                logs.recent_logs.map((line, index) => (
                  <p key={`${line.timestamp}-${index}`} className="break-words">
                    <span className="text-muted-foreground">[{new Date(line.timestamp).toLocaleTimeString()}]</span>{" "}
                    <span className="text-muted-foreground">{line.level || "info"}</span>{" "}
                    <span className="text-muted-foreground">{line.source || "runtime"}</span>{" "}
                    {line.message}
                  </p>
                ))
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="checkpoints">
          <Card variant="surface" className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Checkpoints</h2>
                <p className="mt-1 text-xs text-muted-foreground">Artifacts downloaded from this run.</p>
              </div>
              <Badge variant="default">{artifacts?.length ?? run.artifact_keys.length} files</Badge>
            </div>
            {artifactsError ? <Notice variant="error">{artifactsError}</Notice> : null}
            <div className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow variant="head">
                    <TableHead>Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="px-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {artifacts === undefined ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">Loading checkpoints…</TableCell>
                    </TableRow>
                  ) : artifacts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">No checkpoints downloaded yet.</TableCell>
                    </TableRow>
                  ) : (
                    artifacts.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{formatBytes(item.size)}</TableCell>
                        <TableCell className="text-muted-foreground">{new Date(item.last_modified_at).toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1.5">
                            <Button asChild type="button" variant="ghost" size="icon-sm">
                              <a href={item.download_url} target="_blank" rel="noreferrer" aria-label={`Open ${item.name}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                            <Button asChild type="button" variant="ghost" size="icon-sm">
                              <a href={item.download_url} download={item.name} aria-label={`Download ${item.name}`}>
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <MetricsWindow metrics={metrics} />
          <SystemActivityTable metrics={[...systemSeries, ...runtimeSeries]} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricsWindow({ metrics }: { metrics: RunMetricsOnlyDetail | undefined }) {
  return (
    <Card variant="surface" className="p-4">
      <div className="flex items-start gap-3">
        <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">Metrics window</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {metrics
              ? `Showing ${metrics.metrics_window.returned_points} points across ${metrics.metrics_window.returned_series} series (scan ${metrics.metrics_window.scanned_points}/${metrics.metrics_window.scan_limit}).`
              : "Loading runtime metrics…"}
            {metrics && metrics.metrics_window.dropped_series_count > 0
              ? ` ${metrics.metrics_window.dropped_series_count} series omitted by window limits.`
              : ""}
          </p>
        </div>
      </div>
    </Card>
  )
}

function SystemActivityTable({ metrics }: { metrics: ReturnType<typeof metricSeries> }) {
  return (
    <Card variant="surface" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">System activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Latest bootstrap, artifact, and runtime facts from the run.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow variant="head">
              <TableHead>Metric</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Latest</TableHead>
              <TableHead>Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metrics.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">No system activity yet.</TableCell>
              </TableRow>
            ) : (
              metrics.map((metric) => (
                <TableRow key={`${metric.source}:${metric.name}`}>
                  <TableCell className="font-medium text-foreground">{systemMetricLabel(metric.name)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    <Badge variant={metric.category === "runtime" ? "status-info" : "status-warning"}>
                      {metric.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-foreground">{formatSystemMetricValue(metric.name, metric.latestValue)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {metric.points.length > 0 ? metric.points[metric.points.length - 1]?.label : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

function systemMetricLabel(name: string) {
  return name
    .replace(/^bootstrap_/, "")
    .replace(/^artifacts_/, "artifacts_")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatSystemMetricValue(name: string, value: number) {
  if (!Number.isFinite(value)) return "—"
  if (name.endsWith("_bytes")) return formatBytes(value)
  if (name.endsWith("_seconds")) return `${formatCompactNumber(value)}s`
  if (name.endsWith("_files_per_sec")) return `${formatCompactNumber(value)}/s`
  if (name.endsWith("_files") || name.endsWith("_uploaded")) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }
  return formatCompactNumber(value)
}

function formatCompactNumber(value: number) {
  const absolute = Math.abs(value)
  if (absolute >= 1000 || absolute === 0) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (absolute >= 1) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 3 })
  }
  return value.toPrecision(3)
}
