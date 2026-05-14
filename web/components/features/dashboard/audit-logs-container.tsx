"use client"

import { AuditLogsView } from "@/components/features/dashboard/audit-logs-view"
import type { EnvironmentRow, RunRow } from "@/components/features/dashboard-model"
import { useCloudDashboardUsageEvents } from "@/cloud/dashboard-api"
import { useDashboardEnvironments, useDashboardRuns } from "@/lib/dashboard-api"

type Props = { shouldLoadQueries: boolean }

export function AuditLogsContainer({ shouldLoadQueries }: Props) {
  const envResult = useDashboardEnvironments(shouldLoadQueries) as { environments: EnvironmentRow[] } | undefined
  const runResult = useDashboardRuns(shouldLoadQueries) as { runs: RunRow[] } | undefined
  const usageEvents = useCloudDashboardUsageEvents(shouldLoadQueries, 100)

  const runs = runResult?.runs ?? []
  const environments = envResult?.environments ?? []
  const environmentNameById = new Map(environments.map((e) => [String(e.environment_id), e.name]))

  return (
    <AuditLogsView
      runs={runs}
      usageEvents={usageEvents ?? []}
      environmentNameById={environmentNameById}
    />
  )
}
