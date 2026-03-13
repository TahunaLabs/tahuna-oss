"use client"

import { Sidebar } from "@/components/linear/sidebar"
import { StorageView } from "@/components/linear/storage-view"
import { EnvironmentsView } from "@/components/linear/environments-view"
import { RunsView } from "@/components/linear/runs-view"
import { InboxView } from "@/components/linear/inbox-view"
import { MyIssuesView } from "@/components/linear/my-issues-view"
import { IssuesView } from "@/components/linear/issues-view"
import { ProjectsView } from "@/components/linear/projects-view"
import { useTheme } from "@/components/theme-provider"
import { Notice } from "@/components/ui/notice"
import { PageLoader } from "@/components/ui/spinner"
import {
  STORAGE_PAGE_LIMIT,
  validateArtifactRenameName,
  type DataBlobRow,
  type EnvironmentRow,
  type RunRow,
  type StorageListResult,
  type StorageSort,
  type StorageItem,
  type StorageSourceFilter,
} from "@/components/dashboard/shared"
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
  const [bindSelectionByEnvironment, setBindSelectionByEnvironment] = useState<Record<string, string>>({})
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

  const environments: EnvironmentRow[] = envResult?.environments ?? []
  const dataBlobs: DataBlobRow[] = dataResult?.blobs ?? []
  const runs: RunRow[] = runResult?.runs ?? []

  const generateDataUploadUrlMutation = useMutation(api.data.generateUploadUrl)
  const removeEnvMutation = useMutation(api.environments.remove)
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
      setMessage(uploadedCount === 1 ? "Uploaded 1 file." : `Uploaded ${uploadedCount} files.`)
    } catch (uploadError) {
      const uploadMessage = uploadError instanceof Error ? uploadError.message : "unexpected error"
      setError(
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
      case "inbox":
        return <InboxView />
      case "my-issues":
        return <MyIssuesView />
      case "projects":
        return <ProjectsView />
      case "issues":
        return <IssuesView />
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
            renamingStorageId={renamingStorageId}
            artifactRenameDraft={artifactRenameDraft}
            artifactRenameBusyId={artifactRenameBusyId}
            onUploadData={uploadData}
            onSelectDataFiles={setSelectedDataFiles}
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
            onCancelRun={(runId) => {
              void cancelRun(runId)
            }}
          />
        )
      default:
        return <IssuesView />
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
