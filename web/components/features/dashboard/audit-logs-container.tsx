"use client"

import { AuditLogsView } from "@/components/features/dashboard/audit-logs-view"
import type { EnvironmentRow, RunRow } from "@/components/features/dashboard-model"
import { useDashboardEnvironments, useDashboardRuns } from "@/lib/dashboard-api"

type Props = { shouldLoadQueries: boolean }

export function AuditLogsContainer({ shouldLoadQueries }: Props) {
  const envResult = useDashboardEnvironments(shouldLoadQueries) as { environments: EnvironmentRow[] } | undefined
  const runResult = useDashboardRuns(shouldLoadQueries) as { runs: RunRow[] } | undefined

  const runs = runResult?.runs ?? []
  const environments = envResult?.environments ?? []
  const environmentNameById = new Map(environments.map((e) => [String(e.environment_id), e.name]))

  return <AuditLogsView runs={runs} environmentNameById={environmentNameById} />
}
