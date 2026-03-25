"use client"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { type metricSeries } from "@/components/features/dashboard-model"
import { Badge } from "@/components/ui/badge"

type MetricChartProps = {
  metric: ReturnType<typeof metricSeries>[number]
}

function MetricChart({ metric }: MetricChartProps) {
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
            <span className="text-ui-caption text-muted-foreground">
              {metric.pointCount} point{metric.pointCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-ui-caption uppercase tracking-wide text-muted-foreground">Latest</p>
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

export { MetricChart }
