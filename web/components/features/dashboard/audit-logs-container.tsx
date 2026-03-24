"use client"

import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { AuditLogsView } from "@/components/features/dashboard/audit-logs-view"
import type { EnvironmentRow, RunRow } from "@/components/features/dashboard-model"

type Props = { shouldLoadQueries: boolean }

export function AuditLogsContainer({ shouldLoadQueries }: Props) {
  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined
  const runResult = useQuery(api.runs.list, shouldLoadQueries ? {} : "skip") as
    | { runs: RunRow[] }
    | undefined

  const runs = runResult?.runs ?? []
  const environments = envResult?.environments ?? []
  const environmentNameById = new Map(environments.map((e) => [String(e.environment_id), e.name]))

  return <AuditLogsView runs={runs} environmentNameById={environmentNameById} />
}
