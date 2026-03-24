"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Notice } from "@/components/ui/notice"
import { PageLoader } from "@/components/ui/spinner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useConvexAuth, useQuery } from "convex/react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import {
  metricSeries,
  TERMINAL_STATUSES,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
} from "@/components/features/dashboard-model"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export default function RunDetailPage() {
  const params = useParams<{ id: string }>()
  const runId = typeof params?.id === "string" ? params.id : ""
  const { isAuthenticated, isLoading } = useConvexAuth()
  const shouldLoadQueries = !isLoading && isAuthenticated && runId !== ""

  const run = useQuery(api.runs.get, shouldLoadQueries ? { runId: runId as Id<"runs"> } : "skip") as RunDetail | undefined
  const isTerminal = run !== undefined && TERMINAL_STATUSES.has(run.status)
  const [logsCache, setLogsCache] = useState<RunLogsOnlyDetail | undefined>(undefined)
  const [metricsCache, setMetricsCache] = useState<RunMetricsOnlyDetail | undefined>(undefined)
  const logsLive = useQuery(
    api.runs.getRunLogs,
    shouldLoadQueries && !(isTerminal && logsCache !== undefined)
      ? { runId: runId as Id<"runs"> }
      : "skip"
  ) as RunLogsOnlyDetail | undefined
  const metricsLive = useQuery(
    api.runs.getRunMetrics,
    shouldLoadQueries && !(isTerminal && metricsCache !== undefined)
      ? { runId: runId as Id<"runs"> }
      : "skip"
  ) as RunMetricsOnlyDetail | undefined

  useEffect(() => {
    if (isTerminal && logsLive) setLogsCache(logsLive)
  }, [isTerminal, logsLive])

  useEffect(() => {
    if (isTerminal && metricsLive) setMetricsCache(metricsLive)
  }, [isTerminal, metricsLive])

  const logs = logsLive ?? logsCache
  const metrics = metricsLive ?? metricsCache
  const series = metricSeries(metrics)

  if (isLoading || !isAuthenticated) {
    return <PageLoader message="Loading run details…" />
  }

  if (!runId) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <Notice variant="error">Invalid run ID.</Notice>
      </main>
    )
  }

  if (!run || !logs || !metrics) {
    return <PageLoader message="Loading run details…" />
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Run {run.run_id}</h1>
            <Badge variant="run-status">{run.status}</Badge>
            <Badge variant="run-status">Live</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {run.name} · created {new Date(run.created_at).toLocaleString()}
          </p>
        </div>
        <Button asChild type="button" variant="outline" size="control">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>

      {run.error ? <Notice variant="error">{run.error}</Notice> : null}

      <section className="grid gap-3 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Diagnostics</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Environment</dt>
              <dd className="font-mono text-xs">{run.environment_id}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Pod ID</dt>
              <dd className="font-mono text-xs">{run.pod_id || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Infra</dt>
              <dd className="text-right text-xs">
                {run.effective_gpu_type || "-"} x{run.effective_gpu_count || "-"} · {run.effective_volume_gb || "-"}GB
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Cancellation requested</dt>
              <dd>{run.cancellation_requested ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Artifacts</dt>
              <dd>{run.artifact_keys.length}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Paths</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Input</dt>
              <dd className="font-mono text-xs">{run.input}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Output</dt>
              <dd className="font-mono text-xs">{run.output}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Logs</dt>
              <dd className="font-mono text-xs">{run.logs}</dd>
            </div>
          </dl>
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <Card className="min-h-0 p-4">
          <h2 className="text-sm font-semibold">Live logs</h2>
          <p className="mt-1 text-xs text-muted-foreground">{logs.note}</p>
          <p className="mt-1 text-ui-caption text-muted-foreground">
            Showing {logs.logs_window.returned_logs} logs (tail {logs.logs_window.tail_limit}
            {logs.logs_window.includes_pinned_bootstrap
              ? ` + ${logs.logs_window.pinned_bootstrap_count} pinned bootstrap`
              : ""}).
          </p>
          <div className="mt-3 max-h-[420px] space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2 font-mono text-xs">
            {logs.recent_logs.length === 0 ? (
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

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Live metrics</h2>
          <p className="mt-1 text-ui-caption text-muted-foreground">
            Showing {metrics.metrics_window.returned_points} points across {metrics.metrics_window.returned_series} series
            (scan {metrics.metrics_window.scanned_points}/{metrics.metrics_window.scan_limit}).
            {metrics.metrics_window.dropped_series_count > 0
              ? ` ${metrics.metrics_window.dropped_series_count} series omitted by window limits.`
              : ""}
          </p>
          {series.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No runtime metrics yet.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {series.map((metric) => (
                <div key={metric.name} className="rounded-lg border border-border p-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.name}</p>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={metric.points}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" minTickGap={24} />
                        <YAxis width={48} />
                        <Tooltip />
                        <Line type="monotone" dataKey="value" stroke="currentColor" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </main>
  )
}
