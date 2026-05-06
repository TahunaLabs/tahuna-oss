"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  type EnvironmentRow,
  type ServeLogsOnlyDetail,
  type ServeRow,
} from "@/components/features/dashboard-model"
import { ServingView } from "@/components/features/dashboard/serving-view"
import {
  useDashboardEnvironments,
  useDashboardServeLogs,
  useDashboardServes,
  useStopDashboardServe,
} from "@/lib/dashboard-api"

type Props = {
  shouldLoadQueries: boolean
}

export function ServingContainer({ shouldLoadQueries }: Props) {
  const [busy, setBusy] = useState(false)
  const [selectedServeId, setSelectedServeId] = useState<string | null>(null)

  const envResult = useDashboardEnvironments(shouldLoadQueries) as { environments: EnvironmentRow[] } | undefined
  const serveResult = useDashboardServes(shouldLoadQueries) as { serves: ServeRow[] } | undefined

  const serves = serveResult?.serves
  const environments = envResult?.environments
  const selectedServe = serves?.find((serve) => serve.serve_id === selectedServeId) ?? null

  const serveLogs = useDashboardServeLogs(
    selectedServeId,
    shouldLoadQueries && selectedServeId !== null && selectedServe !== null,
  ) as ServeLogsOnlyDetail | undefined

  const stopServeMutation = useStopDashboardServe()

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    try {
      await task()
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "unexpected error")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function stopServe(serveId: ServeRow["serve_id"]) {
    await withBusy(async () => {
      const result = await stopServeMutation(serveId)
      toast.success(`Serve ${result.serve_id} is ${result.status}.`)
    })
  }

  return (
    <ServingView
      environments={environments}
      serves={serves}
      busy={busy}
      selectedServeId={selectedServeId}
      serveLogs={serveLogs}
      loading={!shouldLoadQueries || envResult === undefined || serveResult === undefined}
      onSelectServe={setSelectedServeId}
      onStopServe={(serveId) => { void stopServe(serveId) }}
    />
  )
}
