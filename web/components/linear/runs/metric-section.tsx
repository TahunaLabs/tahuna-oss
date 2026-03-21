"use client"

import { metricSeries } from "@/components/dashboard/shared"

import { MetricChart } from "@/components/linear/runs/metric-chart"

type MetricSectionProps = {
  title: string
  description: string
  metrics: ReturnType<typeof metricSeries>
  emptyMessage: string
}

function MetricSection({
  title,
  description,
  metrics,
  emptyMessage,
}: MetricSectionProps) {
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
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          {metrics.map((metric) => (
            <MetricChart key={`${metric.source}:${metric.name}`} metric={metric} />
          ))}
        </div>
      )}
    </section>
  )
}

export { MetricSection }
