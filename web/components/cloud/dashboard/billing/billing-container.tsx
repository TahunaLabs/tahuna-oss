"use client"

import { CLOUD_BILLING_CONFIG } from "@/cloud/config"
import { BillingView } from "@/components/cloud/dashboard/billing/billing-view"
import type { EnvironmentRow, RunRow } from "@/components/features/dashboard-model"
import {
  useCloudDashboardCredits,
  useCloudDashboardUsageEvents,
} from "@/cloud/dashboard-api"
import {
  useDashboardEnvironments,
  useDashboardRuns,
} from "@/lib/dashboard-api"

type Props = { shouldLoadQueries: boolean }

export function BillingContainer({ shouldLoadQueries }: Props) {
  const myCredits = useCloudDashboardCredits(shouldLoadQueries)
  const usageEvents = useCloudDashboardUsageEvents(shouldLoadQueries, 100)
  const envResult = useDashboardEnvironments(shouldLoadQueries) as { environments: EnvironmentRow[] } | undefined
  const runResult = useDashboardRuns(shouldLoadQueries) as { runs: RunRow[] } | undefined

  const environments = envResult?.environments ?? []
  const runs = runResult?.runs ?? []

  const environmentNameById = new Map(environments.map((e) => [String(e.environment_id), e.name]))
  const runContextById = new Map(
    runs.map((r) => [
      String(r.run_id),
      { run_name: r.name, environment_name: environmentNameById.get(r.environment_id) ?? null },
    ]),
  )
  const usageEventsWithContext = (usageEvents ?? []).map((event) => {
    if (event.reference_type !== "run" || !event.reference_id) {
      return { ...event, run_name: null, environment_name: null }
    }
    const ctx = runContextById.get(event.reference_id)
    return { ...event, run_name: ctx?.run_name ?? null, environment_name: ctx?.environment_name ?? null }
  })

  return (
    <BillingView
      balanceCents={myCredits?.balance_cents ?? 0}
      bootstrapCreditCents={CLOUD_BILLING_CONFIG.initialCreditCents}
      currency={myCredits?.currency ?? CLOUD_BILLING_CONFIG.currency}
      initialized={myCredits?.initialized === true}
      usageEvents={usageEventsWithContext}
    />
  )
}
