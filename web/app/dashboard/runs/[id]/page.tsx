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
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type RunDetail = {
  run_id: string
  name: string
  created_at: number
  environment_id: string
  input: string
  output: string
  logs: string
  status: string
  error: string
  pod_id: string
  effective_gpu_type: string
  effective_gpu_count: number
  effective_volume_gb: number
  code_manifest_hash: string
  data_manifest_hash: string
  cancellation_requested: boolean
  artifact_keys: string[]
}

type RunLogsDetail = {
  run_id: string
  status: string
  logs_path: string
  log_file: string
  note: string
  recent_logs: Array<{
    timestamp: number
    level: string
    source: string
    message: string
  }>
  recent_metrics: Array<{
    timestamp: number
    name: string
    value: number
    step: number | null
    unit: string | null
    source: string
  }>
}

function metricSeries(logs: RunLogsDetail | undefined) {
  if (!logs) return []
  const grouped = new Map<string, Array<{ x: number; label: string; value: number }>>()
  for (const sample of logs.recent_metrics) {
    const points = grouped.get(sample.name) || []
    points.push({
      x: sample.timestamp,
      label: new Date(sample.timestamp).toLocaleTimeString(),
      value: sample.value,
    })
    grouped.set(sample.name, points)
  }
  return Array.from(grouped.entries()).map(([name, points]) => ({
    name,
    points: points.sort((a, b) => a.x - b.x),
  }))
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>()
  const runId = typeof params?.id === "string" ? params.id : ""
  const { isAuthenticated, isLoading } = useConvexAuth()
  const shouldLoadQueries = !isLoading && isAuthenticated && runId !== ""

  const run = useQuery(api.runs.get, shouldLoadQueries ? { runId: runId as Id<"runs"> } : "skip") as RunDetail | undefined
  const logs = useQuery(api.runs.getLogs, shouldLoadQueries ? { runId: runId as Id<"runs"> } : "skip") as
    | RunLogsDetail
    | undefined

  const series = metricSeries(logs)

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

  if (!run || !logs) {
    return <PageLoader message="Loading run details…" />
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">Run {run.run_id}</h1>
            <Badge variant="dashboard-run-status">{run.status}</Badge>
            <Badge variant="dashboard-run-status">Live</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {run.name} · created {new Date(run.created_at).toLocaleString()}
          </p>
        </div>
        <Button asChild type="button" variant="dashboard-outline" size="none">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>

      {run.error ? <Notice variant="error">{run.error}</Notice> : null}

      <section className="grid gap-3 md:grid-cols-2">
        <Card variant="dashboard" className="p-4">
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

        <Card variant="dashboard" className="p-4">
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
        <Card variant="dashboard" className="min-h-0 p-4">
          <h2 className="text-sm font-semibold">Live logs</h2>
          <p className="mt-1 text-xs text-muted-foreground">{logs.note}</p>
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

        <Card variant="dashboard" className="p-4">
          <h2 className="text-sm font-semibold">Live metrics</h2>
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
