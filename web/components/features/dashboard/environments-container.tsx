"use client"

import { useState } from "react"
import { toast } from "sonner"
import { EnvironmentsView } from "@/components/features/dashboard/environments-view"
import { useEnvironmentConfigEditor } from "@/components/features/dashboard/environments/use-environment-config-editor"
import {
  type DataBlobRow,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import {
  useBindDashboardEnvironmentData,
  useCreateDashboardRun,
  useDashboardDataBlobs,
  useDashboardEnvironments,
  useRemoveDashboardEnvironment,
  useUnbindDashboardEnvironmentData,
} from "@/lib/dashboard-api"

type Props = {
  shouldLoadQueries: boolean
  onOpenShareDialog: (resourceType: "environment", resourceId: string) => void
  quickstartHref?: string
}

export function EnvironmentsContainer({
  shouldLoadQueries,
  onOpenShareDialog,
  quickstartHref,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [bindSelectionByEnvironment, setBindSelectionByEnvironment] = useState<Record<string, string>>({})

  const envResult = useDashboardEnvironments(shouldLoadQueries) as { environments: EnvironmentRow[] } | undefined
  const dataResult = useDashboardDataBlobs(shouldLoadQueries) as { blobs: DataBlobRow[] } | undefined

  const environments = envResult?.environments ?? []
  const dataBlobs = dataResult?.blobs ?? []

  // Deduplicate blobs (keep newest per blob_id)
  const uniqueDataBlobs = (() => {
    const byId = new Map<string, DataBlobRow>()
    for (const blob of dataBlobs) {
      const existing = byId.get(blob.blob_id)
      if (!existing || blob.last_modified_at > existing.last_modified_at) byId.set(blob.blob_id, blob)
    }
    return Array.from(byId.values()).sort((a, b) => b.last_modified_at - a.last_modified_at)
  })()
  const dataBlobsById = new Map(uniqueDataBlobs.map((blob) => [blob.blob_id, blob]))

  const { configEditorEnvironmentId, configEditor, openConfigEditor } = useEnvironmentConfigEditor({
    environments,
    shouldLoadQueries,
  })

  const removeEnvMutation = useRemoveDashboardEnvironment()
  const createRunMutation = useCreateDashboardRun()
  const bindDataMutation = useBindDashboardEnvironmentData()
  const unbindDataMutation = useUnbindDashboardEnvironmentData()

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    try {
      await task()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "unexpected error")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function deleteEnvironments(environmentIds: EnvironmentRow["environment_id"][]): Promise<boolean> {
    if (environmentIds.length === 0) return false
    return withBusy(async () => {
      for (const environmentId of environmentIds) {
        await removeEnvMutation(environmentId)
      }
      const count = environmentIds.length
      toast.success(count === 1 ? "Deleted 1 environment." : `Deleted ${count} environments.`)
    })
  }

  async function launchRun(environmentId: EnvironmentRow["environment_id"]) {
    await withBusy(async () => {
      await createRunMutation(environmentId)
      toast.success("Run launched.")
    })
  }

  async function bindSelectedData(environmentId: EnvironmentRow["environment_id"], selectedDataId: string) {
    const trimmedDataId = selectedDataId.trim()
    if (!trimmedDataId) {
      toast.error("Select a dataset to bind.")
      return
    }
    if (busy) return
    setBindSelectionByEnvironment((current) => ({ ...current, [environmentId]: trimmedDataId }))
    await withBusy(async () => {
      await bindDataMutation(environmentId, [trimmedDataId])
      setBindSelectionByEnvironment((current) => ({ ...current, [environmentId]: "" }))
      toast.success(`Bound ${trimmedDataId} to environment ${environmentId}.`)
    })
  }

  async function unbindDataFromEnvironment(environmentId: EnvironmentRow["environment_id"], dataId: string) {
    await withBusy(async () => {
      await unbindDataMutation(environmentId, [dataId])
      toast.success(`Unbound ${dataId} from environment ${environmentId}.`)
    })
  }

  return (
    <>
      <EnvironmentsView
        environments={environments}
        uniqueDataBlobs={uniqueDataBlobs}
        dataBlobsById={dataBlobsById}
        bindSelectionByEnvironment={bindSelectionByEnvironment}
        busy={busy}
        environmentsLoading={!shouldLoadQueries || envResult === undefined}
        configEditorEnvironmentId={configEditorEnvironmentId}
        configEditor={configEditor}
        onBindSelectionChange={(environmentId, value) =>
          setBindSelectionByEnvironment((current) => ({ ...current, [environmentId]: value }))
        }
        onBindSelectedData={(environment, dataId) => { void bindSelectedData(environment.environment_id, dataId) }}
        onUnbindData={(environmentId, dataId) => { void unbindDataFromEnvironment(environmentId, dataId) }}
        onLaunchRun={(environmentId) => { void launchRun(environmentId) }}
        onOpenConfigEditor={openConfigEditor}
        onDeleteEnvironments={deleteEnvironments}
        onShareEnvironment={(environmentId) => onOpenShareDialog("environment", environmentId)}
        quickstartHref={quickstartHref}
      />
    </>
  )
}
