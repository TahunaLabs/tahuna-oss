"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { EnvironmentsView } from "@/components/features/dashboard/environments-view"
import { Notice } from "@/components/ui/notice"
import {
  type DataBlobRow,
  type EnvironmentConfigDetail,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import type { RunpodCredentialStatus } from "@/components/features/dashboard-settings-model"
import { ENVIRONMENT_CONFIG_FILE_NAME, renderEnvironmentConfig } from "@/lib/environment-config"
import type { Id } from "@convex/_generated/dataModel"

type Props = {
  shouldLoadQueries: boolean
  onOpenShareDialog: (resourceType: "environment", resourceId: string) => void
}

export function EnvironmentsContainer({ shouldLoadQueries, onOpenShareDialog }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [bindSelectionByEnvironment, setBindSelectionByEnvironment] = useState<Record<string, string>>({})
  const [configEditorEnvironmentId, setConfigEditorEnvironmentId] = useState<string | null>(null)
  const [configDraft, setConfigDraft] = useState("")
  const [configSourceText, setConfigSourceText] = useState("")
  const [configError, setConfigError] = useState("")
  const [configSaving, setConfigSaving] = useState(false)

  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined
  const dataResult = useQuery(api.data.list, shouldLoadQueries ? {} : "skip") as
    | { blobs: DataBlobRow[] }
    | undefined
  const runpodCredentialStatus = useQuery(
    api.runpodCredentials.getMyRunpodCredentialStatus,
    shouldLoadQueries ? {} : "skip",
  ) as RunpodCredentialStatus | undefined
  const shouldLoadEnvironmentConfig = shouldLoadQueries && configEditorEnvironmentId !== null
  const environmentConfig = useQuery(
    api.environments.getConfig,
    shouldLoadEnvironmentConfig ? { environmentId: configEditorEnvironmentId as Id<"environments"> } : "skip",
  ) as EnvironmentConfigDetail | undefined

  const environments = envResult?.environments ?? []
  const dataBlobs = dataResult?.blobs ?? []

  // Deduplicate blobs (keep newest per blob_id)
  const uniqueDataBlobs = (() => {
    const byId = new Map<string, DataBlobRow>()
    for (const blob of dataBlobs) {
      const existing = byId.get(blob.blob_id)
      if (!existing || blob.created_at > existing.created_at) byId.set(blob.blob_id, blob)
    }
    return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at)
  })()
  const dataBlobsById = new Map(uniqueDataBlobs.map((blob) => [blob.blob_id, blob]))

  const removeEnvMutation = useMutation(api.environments.remove)
  const updateEnvironmentConfigMutation = useMutation(api.environments.updateConfig)
  const createRunMutation = useMutation(api.runs.create)
  const bindDataMutation = useMutation(api.environments.bindData)
  const unbindDataMutation = useMutation(api.environments.unbindData)

  // Close config editor if its environment is deleted
  useEffect(() => {
    if (!configEditorEnvironmentId) return
    if (environments.some((e) => e.environment_id === configEditorEnvironmentId)) return
    setConfigEditorEnvironmentId(null)
    setConfigDraft("")
    setConfigSourceText("")
    setConfigError("")
  }, [configEditorEnvironmentId, environments])

  // Sync config editor with server data (only when user hasn't made changes)
  useEffect(() => {
    if (!environmentConfig || environmentConfig.environment.environment_id !== configEditorEnvironmentId) return
    if (configDraft && configDraft !== configSourceText) return
    setConfigSourceText(environmentConfig.config_text)
    setConfigDraft(environmentConfig.config_text)
  }, [configDraft, configEditorEnvironmentId, configSourceText, environmentConfig])

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await task()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "unexpected error")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function deleteEnvironments(environmentIds: Id<"environments">[]): Promise<boolean> {
    if (environmentIds.length === 0) return false
    return withBusy(async () => {
      for (const environmentId of environmentIds) {
        await removeEnvMutation({ environmentId })
      }
      const count = environmentIds.length
      setMessage(count === 1 ? "Deleted 1 environment." : `Deleted ${count} environments.`)
    })
  }

  async function launchRun(environmentId: Id<"environments">) {
    if (runpodCredentialStatus?.configured === false) {
      setError("Runpod API key is not configured. Open Settings to add one.")
      setMessage("")
      return
    }
    await withBusy(async () => {
      await createRunMutation({ environmentId })
      setMessage("Run launched.")
    })
  }

  async function bindSelectedData(environmentId: Id<"environments">, selectedDataId: string) {
    const trimmedDataId = selectedDataId.trim()
    if (!trimmedDataId) {
      setError("Select a dataset to bind.")
      return
    }
    if (busy) return
    setBindSelectionByEnvironment((current) => ({ ...current, [environmentId]: trimmedDataId }))
    await withBusy(async () => {
      await bindDataMutation({ environmentId, data_ids: [trimmedDataId] })
      setBindSelectionByEnvironment((current) => ({ ...current, [environmentId]: "" }))
      setMessage(`Bound ${trimmedDataId} to environment ${environmentId}.`)
    })
  }

  async function unbindDataFromEnvironment(environmentId: Id<"environments">, dataId: string) {
    await withBusy(async () => {
      await unbindDataMutation({ environmentId, data_ids: [dataId] })
      setMessage(`Unbound ${dataId} from environment ${environmentId}.`)
    })
  }

  function openEnvironmentConfigEditor(environment: EnvironmentRow) {
    const nextConfig = renderEnvironmentConfig({
      name: environment.name,
      framework: environment.framework,
      version: environment.version,
      python_version: environment.python_version,
      gpu_type: environment.gpu_type,
      gpu_count: environment.gpu_count,
      volume_gb: environment.volume_gb,
    })
    setError("")
    setMessage("")
    setConfigError("")
    setConfigEditorEnvironmentId(environment.environment_id)
    setConfigSourceText(nextConfig)
    setConfigDraft(nextConfig)
  }

  function closeEnvironmentConfigEditor() {
    if (configSaving) return
    setConfigEditorEnvironmentId(null)
    setConfigDraft("")
    setConfigSourceText("")
    setConfigError("")
  }

  async function saveEnvironmentConfig(environmentId: Id<"environments">) {
    setConfigSaving(true)
    setConfigError("")
    setError("")
    setMessage("")
    try {
      const saved = await updateEnvironmentConfigMutation({ environmentId, config_text: configDraft })
      setConfigSourceText(saved.config_text)
      setConfigDraft(saved.config_text)
      setMessage(`Saved config for environment ${environmentId}.`)
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "failed to save environment config")
    } finally {
      setConfigSaving(false)
    }
  }

  return (
    <>
      {(error || message) && (
        <div className="pt-3">
          {error ? <Notice variant="error" className="mb-2">{error}</Notice> : null}
          {message ? <Notice className="mb-2">{message}</Notice> : null}
        </div>
      )}
      <EnvironmentsView
        environments={environments}
        uniqueDataBlobs={uniqueDataBlobs}
        dataBlobsById={dataBlobsById}
        bindSelectionByEnvironment={bindSelectionByEnvironment}
        busy={busy}
        environmentsLoading={shouldLoadQueries && envResult === undefined}
        configEditorEnvironmentId={configEditorEnvironmentId}
        configName={environmentConfig?.config_name || ENVIRONMENT_CONFIG_FILE_NAME}
        configDraft={configDraft}
        configSourceText={configSourceText}
        configError={configError}
        configLoading={shouldLoadEnvironmentConfig && !environmentConfig}
        configSaving={configSaving}
        onBindSelectionChange={(environmentId, value) =>
          setBindSelectionByEnvironment((current) => ({ ...current, [environmentId]: value }))
        }
        onBindSelectedData={(environment, dataId) => { void bindSelectedData(environment.environment_id, dataId) }}
        onUnbindData={(environmentId, dataId) => { void unbindDataFromEnvironment(environmentId, dataId) }}
        onLaunchRun={(environmentId) => { void launchRun(environmentId) }}
        onOpenConfigEditor={openEnvironmentConfigEditor}
        onCloseConfigEditor={closeEnvironmentConfigEditor}
        onConfigDraftChange={setConfigDraft}
        onCancelConfigEdit={() => { setConfigDraft(configSourceText); setConfigError("") }}
        onSaveConfig={(environmentId) => { void saveEnvironmentConfig(environmentId) }}
        onDeleteEnvironments={deleteEnvironments}
        onShareEnvironment={(environmentId) => onOpenShareDialog("environment", environmentId)}
      />
    </>
  )
}
