"use client"

import { useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { BillingView } from "@/components/features/dashboard/billing-view"
import { BILLING_CONFIG } from "@/config"
import type { EnvironmentRow, RunRow } from "@/components/features/dashboard-model"

type Props = { shouldLoadQueries: boolean }

export function BillingContainer({ shouldLoadQueries }: Props) {
  const myCredits = useQuery(api.auth.getMyCredits, shouldLoadQueries ? {} : "skip") as
    | { balance_cents: number; currency: string; initialized: boolean }
    | undefined
  const usageEvents = useQuery(api.auth.listMyUsageEvents, shouldLoadQueries ? { limit: 100 } : "skip") as
    | Array<{
        event_type: string
        credits_delta_cents: number
        balance_after_cents: number
        reference_type: string | null
        reference_id: string | null
        metadata: unknown | null
        created_at: number
      }>
    | undefined
  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined
  const runResult = useQuery(api.runs.list, shouldLoadQueries ? {} : "skip") as
    | { runs: RunRow[] }
    | undefined

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
      bootstrapCreditCents={BILLING_CONFIG.initialCreditCents}
      currency={myCredits?.currency ?? "USD"}
      initialized={myCredits?.initialized === true}
      usageEvents={usageEventsWithContext}
    />
  )
}
