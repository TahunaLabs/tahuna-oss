"use client"

import { Sidebar } from "@/components/linear/sidebar"
import { StorageView } from "@/components/linear/storage-view"
import { EnvironmentsView } from "@/components/linear/environments-view"
import { RunsView } from "@/components/linear/runs-view"
import { useTheme } from "@/components/theme-provider"
import { Notice } from "@/components/ui/notice"
import { PageLoader } from "@/components/ui/spinner"
import {
  STORAGE_PAGE_LIMIT,
  TERMINAL_STATUSES,
  validateArtifactRenameName,
  type DataBlobRow,
  type EnvironmentConfigDetail,
  type EnvironmentRow,
  type RunRow,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
  type StorageListResult,
  type StorageSort,
  type StorageItem,
  type StorageSourceFilter,
} from "@/components/dashboard/shared"
import { ENVIRONMENT_CONFIG_FILE_NAME, renderEnvironmentConfig } from "@/lib/environment-config"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { authClient } from "@/lib/auth-client"
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState, type FormEvent } from "react"

export default function DashboardPage() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth()
  const [loggingOut, setLoggingOut] = useState(false)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [activeView, setActiveView] = useState("environments")

  const [selectedDataFiles, setSelectedDataFiles] = useState<File[]>([])
  const [uploadingData, setUploadingData] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const [uploadMessage, setUploadMessage] = useState("")
  const [dataFileInputKey, setDataFileInputKey] = useState(0)
  const [storageSourceFilter, setStorageSourceFilter] = useState<StorageSourceFilter>("all")
  const [storageSort, setStorageSort] = useState<StorageSort>("created_desc")
  const [storageSearch, setStorageSearch] = useState("")
  const [storageSearchDebounced, setStorageSearchDebounced] = useState("")
  const [storageOffset, setStorageOffset] = useState(0)
  const [storageResult, setStorageResult] = useState<StorageListResult | undefined>(undefined)
  const [storageLoading, setStorageLoading] = useState(false)
  const [storageError, setStorageError] = useState("")
  const [storageReloadToken, setStorageReloadToken] = useState(0)
  const [renamingStorageId, setRenamingStorageId] = useState<string | null>(null)
  const [artifactRenameDraft, setArtifactRenameDraft] = useState("")
  const [artifactRenameBusyId, setArtifactRenameBusyId] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [bindSelectionByEnvironment, setBindSelectionByEnvironment] = useState<Record<string, string>>({})
  const [configEditorEnvironmentId, setConfigEditorEnvironmentId] = useState<string | null>(null)
  const [configDraft, setConfigDraft] = useState("")
  const [configSourceText, setConfigSourceText] = useState("")
  const [configError, setConfigError] = useState("")
  const [configSaving, setConfigSaving] = useState(false)
  const shouldLoadQueries = !authLoading && isAuthenticated && !loggingOut

  const currentUser = useQuery(api.auth.getCurrentUser, shouldLoadQueries ? {} : "skip")
  const envResult = useQuery(api.environments.list, shouldLoadQueries ? {} : "skip") as
    | { environments: EnvironmentRow[] }
    | undefined
  const dataResult = useQuery(api.data.list, shouldLoadQueries ? {} : "skip") as
    | { blobs: DataBlobRow[] }
    | undefined
  const runResult = useQuery(api.runs.list, shouldLoadQueries ? {} : "skip") as
    | { runs: RunRow[] }
    | undefined

  const shouldLoadRunDetail = shouldLoadQueries && selectedRunId !== null
  const selectedRunFromList = runResult?.runs.find((r) => r.run_id === selectedRunId)
  const isSelectedRunTerminal = selectedRunFromList !== undefined && TERMINAL_STATUSES.has(selectedRunFromList.status)
  const [terminalLogsCache, setTerminalLogsCache] = useState<{ runId: string; logs: RunLogsOnlyDetail } | null>(null)
  const [terminalMetricsCache, setTerminalMetricsCache] = useState<{ runId: string; metrics: RunMetricsOnlyDetail } | null>(null)
  const hasTerminalLogsCache = terminalLogsCache !== null && terminalLogsCache.runId === selectedRunId
  const hasTerminalMetricsCache = terminalMetricsCache !== null && terminalMetricsCache.runId === selectedRunId
  const runDetail = useQuery(
    api.runs.get,
    shouldLoadRunDetail ? { runId: selectedRunId as Id<"runs"> } : "skip"
  ) as RunDetail | undefined
  const runLogsLive = useQuery(
    api.runs.getRunLogs,
    shouldLoadRunDetail && !(isSelectedRunTerminal && hasTerminalLogsCache)
      ? { runId: selectedRunId as Id<"runs"> }
      : "skip"
  ) as RunLogsOnlyDetail | undefined
  const runMetricsLive = useQuery(
    api.runs.getRunMetrics,
    shouldLoadRunDetail && !(isSelectedRunTerminal && hasTerminalMetricsCache)
      ? { runId: selectedRunId as Id<"runs"> }
      : "skip"
  ) as RunMetricsOnlyDetail | undefined
  const runLogs = runLogsLive ?? (hasTerminalLogsCache ? terminalLogsCache.logs : undefined)
  const runMetrics = runMetricsLive ?? (hasTerminalMetricsCache ? terminalMetricsCache.metrics : undefined)
  const shouldLoadEnvironmentConfig = shouldLoadQueries && configEditorEnvironmentId !== null
  const environmentConfig = useQuery(
    api.environments.getConfig,
    shouldLoadEnvironmentConfig ? { environmentId: configEditorEnvironmentId as Id<"environments"> } : "skip"
  ) as EnvironmentConfigDetail | undefined

  const environments: EnvironmentRow[] = envResult?.environments ?? []
  const dataBlobs: DataBlobRow[] = dataResult?.blobs ?? []
  const runs: RunRow[] = runResult?.runs ?? []

  const generateDataUploadUrlMutation = useMutation(api.data.generateUploadUrl)
  const removeEnvMutation = useMutation(api.environments.remove)
  const updateEnvironmentConfigMutation = useMutation(api.environments.updateConfig)
  const createRunMutation = useMutation(api.runs.create)
  const cancelRunMutation = useMutation(api.runs.cancel)
  const syncDataMetadataMutation = useMutation(api.data.syncMetadata)
  const bindDataMutation = useMutation(api.environments.bindData)
  const unbindDataMutation = useMutation(api.environments.unbindData)
  const listStorageAction = useAction(api.storage.list)
  const renameArtifactAction = useAction(api.storage.renameArtifact)

  const userEmail = currentUser?.email ?? ""
  const userInitial = userEmail.trim().charAt(0).toUpperCase() || "U"
  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0
  const isDark = resolvedTheme === "dark"

  const uniqueDataBlobs = useMemo(() => {
    const byId = new Map<string, DataBlobRow>()
    for (const blob of dataBlobs) {
      const existing = byId.get(blob.blob_id)
      if (!existing || blob.created_at > existing.created_at) {
        byId.set(blob.blob_id, blob)
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at)
  }, [dataBlobs])

  const dataBlobsById = useMemo(() => {
    return new Map(uniqueDataBlobs.map((blob) => [blob.blob_id, blob]))
  }, [uniqueDataBlobs])

  useEffect(() => {
    if (isSelectedRunTerminal && runLogsLive && selectedRunId) {
      setTerminalLogsCache({ runId: selectedRunId, logs: runLogsLive })
    }
  }, [isSelectedRunTerminal, runLogsLive, selectedRunId])

  useEffect(() => {
    if (isSelectedRunTerminal && runMetricsLive && selectedRunId) {
      setTerminalMetricsCache({ runId: selectedRunId, metrics: runMetricsLive })
    }
  }, [isSelectedRunTerminal, runMetricsLive, selectedRunId])

  useEffect(() => {
    if (!configEditorEnvironmentId) {
      return
    }
    if (environments.some((environment) => environment.environment_id === configEditorEnvironmentId)) {
      return
    }
    setConfigEditorEnvironmentId(null)
    setConfigDraft("")
    setConfigSourceText("")
    setConfigError("")
  }, [configEditorEnvironmentId, environments])

  useEffect(() => {
    if (!environmentConfig || environmentConfig.environment.environment_id !== configEditorEnvironmentId) {
      return
    }
    if (configDraft && configDraft !== configSourceText) {
      return
    }
    setConfigSourceText(environmentConfig.config_text)
    setConfigDraft(environmentConfig.config_text)
  }, [configDraft, configEditorEnvironmentId, configSourceText, environmentConfig])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setStorageSearchDebounced(storageSearch)
    }, 250)
    return () => clearTimeout(timeout)
  }, [storageSearch])

  useEffect(() => {
    setStorageOffset(0)
  }, [storageSearchDebounced, storageSort, storageSourceFilter])

  useEffect(() => {
    let cancelled = false

    if (!shouldLoadQueries) {
      setStorageResult(undefined)
      setStorageLoading(false)
      setStorageError("")
      return
    }

    setStorageLoading(true)
    setStorageError("")
    void listStorageAction({
      source: storageSourceFilter,
      sort: storageSort,
      search: storageSearchDebounced.trim() || undefined,
      offset: storageOffset,
      limit: STORAGE_PAGE_LIMIT,
    })
      .then((result) => {
        if (cancelled) return
        setStorageResult(result as StorageListResult)
      })
      .catch((loadError) => {
        if (cancelled) return
        setStorageError(loadError instanceof Error ? loadError.message : "failed to load storage")
      })
      .finally(() => {
        if (!cancelled) {
          setStorageLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    listStorageAction,
    shouldLoadQueries,
    storageOffset,
    storageReloadToken,
    storageSearchDebounced,
    storageSort,
    storageSourceFilter,
  ])

  useEffect(() => {
    if (!storageResult) return
    if (storageTotal === 0 && storageOffset !== 0) {
      setStorageOffset(0)
      return
    }
    if (storageOffset >= storageTotal && storageTotal > 0) {
      const previousPage = Math.max(0, Math.floor((storageTotal - 1) / STORAGE_PAGE_LIMIT) * STORAGE_PAGE_LIMIT)
      if (previousPage !== storageOffset) {
        setStorageOffset(previousPage)
      }
    }
  }, [storageOffset, storageResult, storageTotal])

  useEffect(() => {
    if (!renamingStorageId) return
    if (storageItems.some((item) => item.id === renamingStorageId)) {
      return
    }
    setRenamingStorageId(null)
    setArtifactRenameDraft("")
  }, [renamingStorageId, storageItems])

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      await task()
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  async function uploadData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedDataFiles.length === 0) return

    setUploadingData(true)
    setUploadError("")
    setUploadMessage("")
    setError("")
    setMessage("")

    try {
      for (const file of selectedDataFiles) {
        const upload = await generateDataUploadUrlMutation({ filename: file.name, size_bytes: file.size })
        const response = await fetch(upload.url, {
          method: "PUT",
          headers: file.type ? { "Content-Type": file.type } : undefined,
          body: file,
        })

        if (!response.ok) {
          throw new Error(`upload failed with status ${response.status}`)
        }

        await syncDataMetadataMutation({ key: upload.key })
      }

      const uploadedCount = selectedDataFiles.length
      setSelectedDataFiles([])
      setDataFileInputKey((current) => current + 1)
      setStorageReloadToken((current) => current + 1)
      setUploadMessage(uploadedCount === 1 ? "Uploaded 1 file." : `Uploaded ${uploadedCount} files.`)
    } catch (uploadError) {
      const uploadMessage = uploadError instanceof Error ? uploadError.message : "unexpected error"
      setUploadError(
        uploadMessage === "Failed to fetch"
          ? "Upload failed. Check the R2 bucket CORS policy for PUT requests from this app origin."
          : uploadMessage,
      )
    } finally {
      setUploadingData(false)
    }
  }

  async function deleteEnvironment(environmentId: Id<"environments">) {
    await withBusy(async () => {
      await removeEnvMutation({ environmentId })
      setMessage(`Environment ${environmentId} deleted.`)
    })
  }

  async function launchRun(environmentId: Id<"environments">) {
    await withBusy(async () => {
      await createRunMutation({ environmentId })
      setMessage("Run launched.")
    })
  }

  async function cancelRun(runId: Id<"runs">) {
    await withBusy(async () => {
      await cancelRunMutation({ runId, force: false })
      setMessage(`Run ${runId} cancellation requested.`)
    })
  }

  async function bindSelectedData(environment: EnvironmentRow) {
    const selectedDataId = (bindSelectionByEnvironment[environment.environment_id] || "").trim()
    if (!selectedDataId) {
      setError("Select a dataset to bind.")
      return
    }
    await withBusy(async () => {
      await bindDataMutation({
        environmentId: environment.environment_id,
        data_ids: [selectedDataId],
      })
      setBindSelectionByEnvironment((current) => ({
        ...current,
        [environment.environment_id]: "",
      }))
      setMessage(`Bound ${selectedDataId} to environment ${environment.environment_id}.`)
    })
  }

  async function unbindDataFromEnvironment(environmentId: Id<"environments">, dataId: string) {
    await withBusy(async () => {
      await unbindDataMutation({
        environmentId,
        data_ids: [dataId],
      })
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

  function cancelEnvironmentConfigEdit() {
    setConfigDraft(configSourceText)
    setConfigError("")
  }

  async function saveEnvironmentConfig(environmentId: Id<"environments">) {
    setConfigSaving(true)
    setConfigError("")
    setError("")
    setMessage("")
    try {
      const saved = await updateEnvironmentConfigMutation({
        environmentId,
        config_text: configDraft,
      })
      setConfigSourceText(saved.config_text)
      setConfigDraft(saved.config_text)
      setMessage(`Saved config for environment ${environmentId}.`)
    } catch (saveError) {
      setConfigError(saveError instanceof Error ? saveError.message : "failed to save environment config")
    } finally {
      setConfigSaving(false)
    }
  }

  function startRenameArtifact(item: StorageItem) {
    if (item.source !== "run_artifact") return
    setError("")
    setMessage("")
    setRenamingStorageId(item.id)
    setArtifactRenameDraft(item.name)
  }

  function cancelRenameArtifact() {
    if (artifactRenameBusyId) return
    setRenamingStorageId(null)
    setArtifactRenameDraft("")
  }

  async function saveRenameArtifact(item: StorageItem) {
    if (item.source !== "run_artifact" || !item.run_id) {
      setError("only run artifacts can be renamed")
      return
    }
    let nextName = ""
    try {
      nextName = validateArtifactRenameName(artifactRenameDraft)
    } catch (renameValidationError) {
      setError(renameValidationError instanceof Error ? renameValidationError.message : "invalid artifact name")
      return
    }
    if (nextName === item.name) {
      setError("new artifact name must differ from the current name")
      return
    }

    setError("")
    setMessage("")
    setArtifactRenameBusyId(item.id)
    try {
      const renamed = await renameArtifactAction({
        runId: item.run_id as Id<"runs">,
        key: item.key,
        name: nextName,
      })
      setRenamingStorageId(null)
      setArtifactRenameDraft("")
      setStorageReloadToken((current) => current + 1)
      setMessage(
        renamed.cleanup_warning
          ? `Renamed artifact to ${renamed.name}. Old object cleanup needs a retry.`
          : `Renamed artifact to ${renamed.name}.`,
      )
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "failed to rename artifact")
    } finally {
      setArtifactRenameBusyId(null)
    }
  }

  async function logout() {
    setLoggingOut(true)
    setError("")
    setMessage("")
    try {
      await authClient.signOut()
      router.replace("/login")
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Failed to sign out.")
      setLoggingOut(false)
    }
  }

  if (authLoading || loggingOut || !isAuthenticated) {
    return <PageLoader message="Loading dashboard…" />
  }

  const renderMainContent = () => {
    switch (activeView) {
      case "storage":
        return (
          <StorageView
            selectedDataFiles={selectedDataFiles}
            uploadingData={uploadingData}
            dataFileInputKey={dataFileInputKey}
            storageSearch={storageSearch}
            storageSourceFilter={storageSourceFilter}
            storageSort={storageSort}
            storageResult={storageResult}
            storageLoading={storageLoading}
            storageError={storageError}
            uploadError={uploadError}
            uploadMessage={uploadMessage}
            renamingStorageId={renamingStorageId}
            artifactRenameDraft={artifactRenameDraft}
            artifactRenameBusyId={artifactRenameBusyId}
            onUploadData={uploadData}
            onSelectDataFiles={(files) => {
              setUploadError("")
              setUploadMessage("")
              setSelectedDataFiles(files)
            }}
            onStorageSearchChange={setStorageSearch}
            onStorageSourceFilterChange={setStorageSourceFilter}
            onStorageSortChange={setStorageSort}
            onArtifactRenameDraftChange={setArtifactRenameDraft}
            onSaveRenameArtifact={(item) => {
              void saveRenameArtifact(item)
            }}
            onCancelRenameArtifact={cancelRenameArtifact}
            onStartRenameArtifact={startRenameArtifact}
            onPreviousStoragePage={() =>
              setStorageOffset((current) => Math.max(0, current - STORAGE_PAGE_LIMIT))
            }
            onNextStoragePage={() =>
              setStorageOffset((current) => current + STORAGE_PAGE_LIMIT)
            }
          />
        )
      case "environments":
        return (
          <EnvironmentsView
            environments={environments}
            uniqueDataBlobs={uniqueDataBlobs}
            dataBlobsById={dataBlobsById}
            bindSelectionByEnvironment={bindSelectionByEnvironment}
            busy={busy}
            configEditorEnvironmentId={configEditorEnvironmentId}
            configName={environmentConfig?.config_name || ENVIRONMENT_CONFIG_FILE_NAME}
            configDraft={configDraft}
            configSourceText={configSourceText}
            configError={configError}
            configLoading={shouldLoadEnvironmentConfig && !environmentConfig}
            configSaving={configSaving}
            onBindSelectionChange={(environmentId, value) =>
              setBindSelectionByEnvironment((current) => ({
                ...current,
                [environmentId]: value,
              }))
            }
            onBindSelectedData={(environment) => {
              void bindSelectedData(environment)
            }}
            onUnbindData={(environmentId, dataId) => {
              void unbindDataFromEnvironment(environmentId, dataId)
            }}
            onLaunchRun={(environmentId) => {
              void launchRun(environmentId)
            }}
            onOpenConfigEditor={(environment) => {
              openEnvironmentConfigEditor(environment)
            }}
            onCloseConfigEditor={closeEnvironmentConfigEditor}
            onConfigDraftChange={setConfigDraft}
            onCancelConfigEdit={cancelEnvironmentConfigEdit}
            onSaveConfig={(environmentId) => {
              void saveEnvironmentConfig(environmentId)
            }}
            onDeleteEnvironment={(environmentId) => {
              void deleteEnvironment(environmentId)
            }}
          />
        )
      case "runs":
        return (
          <RunsView
            environments={environments}
            runs={runs}
            busy={busy}
            selectedRunId={selectedRunId}
            runDetail={runDetail}
            runLogs={runLogs}
            runMetrics={runMetrics}
            onSelectRun={setSelectedRunId}
            onCancelRun={(runId) => {
              void cancelRun(runId)
            }}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen bg-sidebar dark">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        userInitial={userInitial}
        isDark={isDark}
        onThemeToggle={() => setTheme(isDark ? "light" : "dark")}
        onLogout={logout}
      />
      <main className="flex-1 bg-background rounded-tl-xl border-l border-border overflow-hidden flex flex-col">
        {/* Notices */}
        {(error || message) && (
          <div className="px-6 pt-3">
            {error ? <Notice variant="error" className="mb-2">{error}</Notice> : null}
            {message ? <Notice className="mb-2">{message}</Notice> : null}
          </div>
        )}
        {renderMainContent()}
      </main>
    </div>
  )
}
