"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"

import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import {
  type EnvironmentRow,
  type ServeLogsOnlyDetail,
  type ServeRow,
} from "@/components/features/dashboard-model"
import { ServingView } from "@/components/features/dashboard/serving-view"

type Props = {
  shouldLoadQueries: boolean
}

export function ServingContainer({ shouldLoadQueries }: Props) {
  const [busy, setBusy] = useState(false)
  const [selectedServeId, setSelectedServeId] = useState<string | null>(null)

  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined
  const serveResult = useQuery(api.serves.list, shouldLoadQueries ? {} : "skip") as
    | { serves: ServeRow[] }
    | undefined

  const serves = serveResult?.serves
  const environments = envResult?.environments
  const selectedServe = serves?.find((serve) => serve.serve_id === selectedServeId) ?? null

  const serveLogs = useQuery(
    api.serves.getLogs,
    shouldLoadQueries && selectedServeId !== null && selectedServe !== null
      ? { serveId: selectedServeId as Id<"serves"> }
      : "skip",
  ) as ServeLogsOnlyDetail | undefined

  const stopServeMutation = useMutation(api.serves.stop)

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

  async function stopServe(serveId: Id<"serves">) {
    await withBusy(async () => {
      const result = await stopServeMutation({ serveId, force: false })
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
