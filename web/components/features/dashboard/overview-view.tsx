"use client"

import Link from "next/link"
import { LayoutGrid } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { relativeTime, type EnvironmentRow, type RunRow } from "@/components/features/dashboard-model"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"

export type OverviewKpi = { label: string; value: string; hint: string }
export type ActivityPoint = { label: string; runs: number }

type OverviewViewProps = {
  kpis: OverviewKpi[]
  activity: ActivityPoint[]
  recentRuns: RunRow[]
  environments: EnvironmentRow[]
  loading: boolean
}

export function OverviewView({ kpis, activity, recentRuns, environments, loading }: OverviewViewProps) {
  const environmentNameById = new Map(environments.map((environment) => [String(environment.environment_id), environment.name]))

  return (
    <DashboardViewLayout
      sectionLabel="Overview"
      title="Overview"
      titleIcon={<LayoutGrid size={24} />}
      toolbar={<p className="text-sm text-muted-foreground">Your training at a glance.</p>}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label} variant="surface" className="p-5">
              <p className="text-ui-micro uppercase tracking-ui-eyebrow text-muted-foreground">{kpi.label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{kpi.value}</p>
              <p className="mt-1 text-ui-caption text-muted-foreground">{kpi.hint}</p>
            </Card>
          ))}
        </div>

        <Card variant="surface" className="p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Training activity</h2>
            <p className="text-ui-caption text-muted-foreground">Runs started over the last 14 days</p>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="overview-activity" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} width={28} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="runs"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#overview-activity)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card variant="surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Recent runs</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard?view=runs">View all</Link>
            </Button>
          </div>
          {recentRuns.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {loading ? "Loading runs…" : "No runs yet."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {recentRuns.map((run) => (
                <Link
                  key={run.run_id}
                  href={`/dashboard/runs/${run.run_id}`}
                  className="grid grid-cols-[1.5fr_1fr_1fr_auto] items-center gap-3 px-5 py-3 transition-colors hover:bg-muted"
                >
                  <span className="truncate text-sm text-foreground">{run.name || "Untitled run"}</span>
                  <span className="flex items-center gap-1.5 text-ui-caption capitalize text-muted-foreground">
                    <StatusDot variant={toStatusDotVariant(run.status)} size="xs" />
                    {run.status}
                  </span>
                  <span className="truncate text-ui-caption text-muted-foreground">
                    {environmentNameById.get(run.environment_id) ?? "—"}
                  </span>
                  <span className="text-right text-ui-caption text-muted-foreground">
                    {run.created_at > 0 ? relativeTime(run.created_at) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </DashboardViewLayout>
  )
}
