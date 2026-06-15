"use client"

import {
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChartNoAxesCombined, Search } from "lucide-react"
import { useState } from "react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import {
  relativeTime,
  type HillclimbExperiment,
  type HillclimbSessionDetail,
  type HillclimbSessionSummary,
} from "@/components/features/dashboard-model"
import { type HillclimbDirection } from "@/components/features/dashboard/hillclimb-container"
import { Badge, statusVariant } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type HillclimbViewProps = {
  sessions: HillclimbSessionSummary[] | undefined
  selectedSessionId: string | null
  detail: HillclimbSessionDetail | undefined
  metricName: string | null | undefined
  direction: HillclimbDirection
  onSelectSession: (sessionId: string) => void
  onSelectMetric: (metricName: string) => void
}

type ChartExperiment = HillclimbExperiment & {
  value: number | null
  runningBest: number | null
  label: "kept" | "discarded" | "inconclusive"
  shortLabel: string
}

const HILLCLIMB_CHART_COLORS = {
  kept: "oklch(0.34 0.06 295)",
  discarded: "oklch(0.48 0.01 285)",
  inconclusive: "oklch(0.42 0.03 260)",
}

function HillclimbView({
  sessions,
  selectedSessionId,
  detail,
  metricName,
  direction,
  onSelectSession,
  onSelectMetric,
}: HillclimbViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const query = searchQuery.trim().toLowerCase()
  const filteredSessions = (sessions ?? []).filter((session) =>
    query ? session.session_id.toLowerCase().includes(query) : true,
  )
  const chartExperiments = buildChartExperiments(detail?.experiments ?? [], direction)
  const keptCount = chartExperiments.filter((experiment) => experiment.kind === "trial" && experiment.label === "kept").length
  const discardedCount = chartExperiments.filter((experiment) => experiment.kind === "trial" && experiment.label === "discarded").length

  return (
    <DashboardViewLayout
      sectionLabel="Hillclimb"
      title="Hillclimb"
      titleIcon={<ChartNoAxesCombined size={24} />}
      count={sessions && sessions.length > 0 ? sessions.length : undefined}
      toolbar={(
        <div className="flex w-full min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="relative min-w-0 md:min-w-52 md:max-w-80 md:grow">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="text"
              variant="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search sessions"
            />
          </div>
          <Select
            aria-label="Hillclimb session"
            className="md:max-w-80"
            value={selectedSessionId ?? ""}
            onChange={(event) => onSelectSession(event.target.value)}
            disabled={filteredSessions.length === 0}
          >
            {filteredSessions.length === 0 ? (
              <option value="">No sessions</option>
            ) : (
              filteredSessions.map((session) => (
                <option key={session.session_id} value={session.session_id}>
                  {session.session_id}
                </option>
              ))
            )}
          </Select>
        </div>
      )}
    >
      {sessions === undefined ? (
        <Card variant="ghost" className="flex min-h-72 flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading hillclimbs…</p>
        </Card>
      ) : sessions.length === 0 ? (
        <Card variant="surface" className="flex min-h-72 flex-col items-center justify-center gap-3 p-6">
          <ChartNoAxesCombined className="h-6 w-6 text-muted-foreground" />
          <p className="max-w-lg text-center text-sm text-muted-foreground">
            No research runs found. Sessions appear here when runs are named like
            research-&lt;session&gt;-baseline and research-&lt;session&gt;-trial-N.
          </p>
        </Card>
      ) : detail === undefined ? (
        <Card variant="surface" className="px-6 py-10">
          <p className="text-sm text-muted-foreground">Loading hillclimb session…</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <HillclimbSummary
            detail={detail}
            metricName={metricName}
            keptCount={keptCount}
            discardedCount={discardedCount}
            onSelectMetric={onSelectMetric}
          />
          <HillclimbChart
            experiments={chartExperiments}
            metricName={metricName}
            direction={direction}
          />
          <HillclimbExperimentTable experiments={chartExperiments} metricName={metricName} />
        </div>
      )}
    </DashboardViewLayout>
  )
}

function HillclimbSummary({
  detail,
  metricName,
  keptCount,
  discardedCount,
  onSelectMetric,
}: {
  detail: HillclimbSessionDetail
  metricName: string | null | undefined
  keptCount: number
  discardedCount: number
  onSelectMetric: (metricName: string) => void
}) {
  const latestExperiment = detail.experiments[detail.experiments.length - 1]

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Card variant="surface" className="p-4 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ui-caption uppercase tracking-ui-eyebrow text-muted-foreground">Session ID</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-foreground">{detail.session_id}</h2>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-4">
          <MetricTile label="Experiments" value={String(detail.experiments.length)} />
          <MetricTile label="Kept" value={String(keptCount)} />
          <MetricTile label="Discarded" value={String(discardedCount)} />
          <MetricTile
            label="Updated"
            value={latestExperiment ? relativeTime(latestExperiment.created_at) : "—"}
          />
        </dl>
      </Card>
      <Card variant="surface" className="p-4">
        <label className="text-ui-caption uppercase tracking-ui-eyebrow text-muted-foreground" htmlFor="hillclimb-metric">
          Objective metric
        </label>
        <Select
          id="hillclimb-metric"
          className="mt-2"
          value={metricName ?? ""}
          onChange={(event) => onSelectMetric(event.target.value)}
          disabled={detail.metrics.length === 0}
        >
          {detail.metrics.length === 0 ? (
            <option value="">No metrics</option>
          ) : (
            detail.metrics.map((metric) => (
              <option key={metric.name} value={metric.name}>
                {metric.name} ({metric.count})
              </option>
            ))
          )}
        </Select>
        <p className="mt-3 text-xs text-muted-foreground">
          Showing metrics reported by these runs. CLI-only research notes are not available here yet.
        </p>
      </Card>
    </div>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ui-caption uppercase tracking-ui-eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-sm font-semibold text-foreground">{value}</dd>
    </div>
  )
}

function HillclimbChart({
  experiments,
  metricName,
  direction,
}: {
  experiments: ChartExperiment[]
  metricName: string | null | undefined
  direction: HillclimbDirection
}) {
  const chartData = experiments.filter((experiment) => experiment.value !== null)
  const kept = chartData.filter((experiment) => experiment.label === "kept")
  const keptImprovementCount = kept.filter((experiment) => experiment.kind === "trial").length
  const discarded = chartData.filter((experiment) => experiment.label === "discarded")
  const inconclusive = chartData.filter((experiment) => experiment.label === "inconclusive")
  const values = chartData.flatMap((experiment) => [experiment.value, experiment.runningBest]).filter((value): value is number => value !== null)
  const yDomain = metricDomain(values)

  return (
    <Card variant="surface" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {metricName ?? "Metric"} progress
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {experiments.length} experiments, {keptImprovementCount} kept improvements
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <LegendDot color={HILLCLIMB_CHART_COLORS.kept} label="Kept" />
          <LegendDot color={HILLCLIMB_CHART_COLORS.discarded} label="Discarded" />
          <LegendDot color={HILLCLIMB_CHART_COLORS.inconclusive} label="Inconclusive" />
          <span>Running best</span>
        </div>
      </div>
      <div className="mt-4 h-96 min-h-72 w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded border border-border bg-background">
            <p className="text-sm text-muted-foreground">No metric values emitted for this session.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 24, right: 24, bottom: 24, left: 8 }}>
              <CartesianGrid stroke="var(--border)" opacity={0.5} />
              <XAxis
                dataKey="trial_number"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => (value === 0 ? "baseline" : String(value))}
                label={{
                  value: "Experiment #",
                  position: "insideBottom",
                  offset: -12,
                  fill: "var(--muted-foreground)",
                  fontSize: 12,
                }}
              />
              <YAxis
                width={68}
                domain={yDomain}
                tickFormatter={(value: number) => formatMetricValue(value)}
                label={{
                  value: `${metricName ?? "metric"} (${direction === "minimize" ? "lower" : "higher"} is better)`,
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--muted-foreground)",
                  fontSize: 12,
                }}
              />
              <Tooltip
                formatter={(value: number, name: string) => [formatMetricValue(value), name === "runningBest" ? "running best" : metricName ?? "value"]}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? "Experiment"}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              />
              <Line
                type="stepAfter"
                dataKey="runningBest"
                name="running best"
                stroke={HILLCLIMB_CHART_COLORS.kept}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Scatter data={discarded} dataKey="value" name="discarded" fill={HILLCLIMB_CHART_COLORS.discarded} opacity={0.25} />
              <Scatter data={inconclusive} dataKey="value" name="inconclusive" fill={HILLCLIMB_CHART_COLORS.inconclusive} />
              <Scatter data={kept} dataKey="value" name="kept" fill={HILLCLIMB_CHART_COLORS.kept}>
                <LabelList dataKey="shortLabel" position="top" fill={HILLCLIMB_CHART_COLORS.kept} fontSize={11} />
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function HillclimbExperimentTable({
  experiments,
  metricName,
}: {
  experiments: ChartExperiment[]
  metricName: string | null | undefined
}) {
  return (
    <Card variant="surface" className="overflow-auto">
      <Table>
        <TableHeader>
          <TableRow variant="head">
            <TableHead>Experiment</TableHead>
            <TableHead>Run ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Latest</TableHead>
            <TableHead>Final</TableHead>
            <TableHead>Running best</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {experiments.map((experiment) => (
            <TableRow key={experiment.run_id}>
              <TableCell className="font-medium text-foreground">
                {experiment.kind === "baseline" ? "Baseline" : `Trial ${experiment.trial_number}`}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{experiment.run_id}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <StatusDot variant={toStatusDotVariant(experiment.status)} />
                  <Badge variant={experiment.label === "kept" ? "status-success" : statusVariant(experiment.status)}>
                    {experiment.kind === "baseline" ? "baseline" : experiment.label === "kept" ? "kept" : experiment.status}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="font-mono text-foreground">
                {formatMetricCell(experiment.latest_value, experiment.latest_step)}
              </TableCell>
              <TableCell className="font-mono text-foreground">
                {formatMetricCell(experiment.final_value, experiment.final_step)}
              </TableCell>
              <TableCell className="font-mono text-foreground">
                {formatMetricValue(experiment.runningBest)}
              </TableCell>
            </TableRow>
          ))}
          {experiments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                No experiments found for {metricName ?? "this metric"}.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </Card>
  )
}

function buildChartExperiments(experiments: HillclimbExperiment[], direction: HillclimbDirection) {
  let runningBest: number | null = null
  return experiments.map((experiment) => {
    const value = experiment.final_value ?? experiment.latest_value
    const improved = value !== null && (runningBest === null || isImprovement(value, runningBest, direction))
    if (improved) {
      runningBest = value
    }
    const label = value === null
      ? "inconclusive"
      : improved
        ? "kept"
        : "discarded"
    return {
      ...experiment,
      value,
      runningBest,
      label,
      shortLabel: experiment.kind === "baseline" ? "baseline" : `trial ${experiment.trial_number}`,
    } satisfies ChartExperiment
  })
}

function isImprovement(candidate: number, incumbent: number, direction: HillclimbDirection) {
  return direction === "maximize" ? candidate > incumbent : candidate < incumbent
}

function metricDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.05, 1)
    return [min - pad, max + pad]
  }
  const pad = (max - min) * 0.08
  return [min - pad, max + pad]
}

function formatMetricCell(value: number | null, step: number | null) {
  if (value === null) return "—"
  return step === null ? formatMetricValue(value) : `${formatMetricValue(value)} @ ${step}`
}

function formatMetricValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—"
  const absolute = Math.abs(value)
  if (absolute >= 1000 || absolute === 0) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (absolute >= 1) {
    return value.toFixed(3)
  }
  return value.toPrecision(3)
}

export { HillclimbView }
