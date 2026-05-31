"use client"

import { ACTIVE_STATUSES, TERMINAL_STATUSES } from "@/components/features/dashboard-model"
import { OverviewView, type ActivityPoint, type OverviewKpi } from "@/components/features/dashboard/overview-view"
import { useDashboardEnvironments, useDashboardRuns, useDashboardServes } from "@/lib/dashboard-api"

const DAY_MS = 86_400_000
const ACTIVITY_DAYS = 14

type Props = {
  shouldLoadQueries: boolean
}

export function OverviewContainer({ shouldLoadQueries }: Props) {
  const runResult = useDashboardRuns(shouldLoadQueries)
  const envResult = useDashboardEnvironments(shouldLoadQueries)
  const serveResult = useDashboardServes(shouldLoadQueries)

  const runs = runResult?.runs
  const environments = envResult?.environments ?? []
  const serves = serveResult?.serves ?? []
  const loading = runs === undefined
  const safeRuns = runs ?? []

  const activeRuns = safeRuns.filter((run) => ACTIVE_STATUSES.has(run.status)).length
  const computeHours = safeRuns.reduce((total, run) => total + Math.max(run.uptime_ms, 0), 0) / 3_600_000
  const terminalRuns = safeRuns.filter((run) => TERMINAL_STATUSES.has(run.status))
  const succeededRuns = safeRuns.filter((run) => run.status === "completed" || run.status === "succeeded").length
  const successRate = terminalRuns.length > 0 ? Math.round((succeededRuns / terminalRuns.length) * 100) : null

  const kpis: OverviewKpi[] = [
    { label: "Active runs", value: String(activeRuns), hint: "Provisioning or running" },
    { label: "Success rate", value: successRate === null ? "—" : `${successRate}%`, hint: "Completed vs failed" },
    { label: "GPU hours", value: computeHours.toFixed(1), hint: "Across all runs" },
    { label: "Deployed", value: String(serves.length), hint: "Models serving" },
  ]

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const activity: ActivityPoint[] = Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const dayStart = startOfToday.getTime() - (ACTIVITY_DAYS - 1 - index) * DAY_MS
    const dayEnd = dayStart + DAY_MS
    const day = new Date(dayStart)
    return {
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      runs: safeRuns.filter((run) => run.created_at >= dayStart && run.created_at < dayEnd).length,
    }
  })

  const recentRuns = [...safeRuns].sort((a, b) => b.created_at - a.created_at).slice(0, 6)

  return (
    <OverviewView
      kpis={kpis}
      activity={activity}
      recentRuns={recentRuns}
      environments={environments}
      loading={loading}
    />
  )
}
