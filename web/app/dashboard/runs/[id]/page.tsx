"use client"

import { ArrowLeft, RotateCw } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

import {
  TERMINAL_STATUSES,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
} from "@/components/features/dashboard-model"
import { RunDashboard } from "@/components/features/dashboard/runs/run-dashboard"
import { PageLoader } from "@/components/loader"
import { Button } from "@/components/ui/button"
import { Notice } from "@/components/ui/notice"
import {
  useDashboardAuthState,
  useDashboardEnvironments,
  useDashboardRunDetail,
  useDashboardRunLogs,
  useDashboardRunMetrics,
} from "@/lib/dashboard-api"

export default function RunDetailPage() {
  const params = useParams<{ id: string }>()
  const runId = typeof params?.id === "string" ? params.id : ""
  const { isAuthenticated, isLoading } = useDashboardAuthState()
  const shouldLoadQueries = !isLoading && isAuthenticated && runId !== ""

  const [logsCache, setLogsCache] = useState<RunLogsOnlyDetail | undefined>(undefined)
  const [metricsCache, setMetricsCache] = useState<RunMetricsOnlyDetail | undefined>(undefined)

  const envResult = useDashboardEnvironments(shouldLoadQueries)
  const run = useDashboardRunDetail(runId, shouldLoadQueries) as RunDetail | undefined
  const isTerminal = run !== undefined && TERMINAL_STATUSES.has(run.status)
  const logsLive = useDashboardRunLogs(
    runId,
    shouldLoadQueries && !(isTerminal && logsCache !== undefined),
  ) as RunLogsOnlyDetail | undefined
  const metricsLive = useDashboardRunMetrics(
    runId,
    shouldLoadQueries && !(isTerminal && metricsCache !== undefined),
  ) as RunMetricsOnlyDetail | undefined

  useEffect(() => {
    if (isTerminal && logsLive) setLogsCache(logsLive)
  }, [isTerminal, logsLive])

  useEffect(() => {
    if (isTerminal && metricsLive) setMetricsCache(metricsLive)
  }, [isTerminal, metricsLive])

  const logs = logsLive ?? logsCache
  const metrics = metricsLive ?? metricsCache
  const environmentLabel = envResult?.environments.find((environment) => environment.environment_id === run?.environment_id)?.name

  if (isLoading || !isAuthenticated) {
    return <PageLoader message="Loading run details…" />
  }

  if (!runId) {
    return (
      <main className="h-full overflow-y-auto bg-background">
        <div className="mx-auto w-full max-w-7xl px-4 py-6">
          <Notice variant="error">Invalid run ID.</Notice>
        </div>
      </main>
    )
  }

  if (!run) {
    return <PageLoader message="Loading run details…" />
  }

  return (
    <main className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-5">
        <RunDashboard
          run={run}
          logs={logs}
          metrics={metrics}
          environmentLabel={environmentLabel}
          leading={(
            <Button asChild type="button" variant="ghost" size="icon-control">
              <Link href="/dashboard?view=runs" aria-label="Back to runs">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          )}
          actions={(
            <Button type="button" variant="outline" size="control" onClick={() => window.location.reload()}>
              <RotateCw className="h-4 w-4" />
              Refresh
            </Button>
          )}
        />
      </div>
    </main>
  )
}
