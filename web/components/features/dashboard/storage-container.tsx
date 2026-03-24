"use client"

import { useEffect, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import type { FormEvent } from "react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { StorageView } from "@/components/features/dashboard/storage-view"
import {
  STORAGE_PAGE_LIMIT,
  validateArtifactRenameName,
  type StorageItem,
  type StorageListResult,
} from "@/components/features/dashboard-model"
import type { Id } from "@convex/_generated/dataModel"

const STORAGE_SOURCE_FILTER_VALUES = ["all", "shared", "private"] as const
const STORAGE_SORT_VALUES = ["created_desc", "created_asc", "name_asc", "name_desc", "size_desc", "size_asc"] as const

type Props = {
  shouldLoadQueries: boolean
  onOpenShareDialog: (resourceType: "data", resourceId: string) => void
}

export function StorageContainer({ shouldLoadQueries, onOpenShareDialog }: Props) {
  const [selectedDataFiles, setSelectedDataFiles] = useState<File[]>([])
  const [uploadingData, setUploadingData] = useState(false)
  const [dataFileInputKey, setDataFileInputKey] = useState(0)

  const [storageSourceFilter, setStorageSourceFilter] = useQueryState(
    "storageSource",
    parseAsStringLiteral(STORAGE_SOURCE_FILTER_VALUES).withDefault("all"),
  )
  const [storageSort, setStorageSort] = useQueryState(
    "storageSort",
    parseAsStringLiteral(STORAGE_SORT_VALUES).withDefault("created_desc"),
  )
  const [storageSearch, setStorageSearch] = useQueryState("storageQ", parseAsString.withDefault(""))
  const [storageOffset, setStorageOffset] = useQueryState("storageOffset", parseAsInteger.withDefault(0))
  const [storageSearchDebounced, setStorageSearchDebounced] = useState(storageSearch)
  const [storageResult, setStorageResult] = useState<StorageListResult | undefined>(undefined)
  const [storageLoading, setStorageLoading] = useState(false)
  const [storageError, setStorageError] = useState("")
  const [storageReloadToken, setStorageReloadToken] = useState(0)
  const [renamingStorageId, setRenamingStorageId] = useState<string | null>(null)
  const [artifactRenameDraft, setArtifactRenameDraft] = useState("")
  const [artifactRenameBusyId, setArtifactRenameBusyId] = useState<string | null>(null)

  const generateDataUploadUrlMutation = useMutation(api.data.generateUploadUrl)
  const syncDataMetadataMutation = useMutation(api.data.syncMetadata)
  const listStorageAction = useAction(api.storage.list)
  const renameArtifactAction = useAction(api.storage.renameArtifact)
  const setStorageVisibilityMutation = useMutation(api.storage.setVisibility)

  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0

  // Debounce search to avoid hammering the action on every keystroke
  useEffect(() => {
    const timeout = setTimeout(() => setStorageSearchDebounced(storageSearch), 250)
    return () => clearTimeout(timeout)
  }, [storageSearch])

  // Fetch storage list whenever filters, sort, search, or offset changes
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
      visibility: storageSourceFilter,
      sort: storageSort,
      search: storageSearchDebounced.trim() || undefined,
      offset: storageOffset,
      limit: STORAGE_PAGE_LIMIT,
    })
      .then((result) => { if (!cancelled) setStorageResult(result as StorageListResult) })
      .catch((e) => { if (!cancelled) setStorageError(e instanceof Error ? e.message : "failed to load storage") })
      .finally(() => { if (!cancelled) setStorageLoading(false) })
    return () => { cancelled = true }
  }, [listStorageAction, shouldLoadQueries, storageOffset, storageReloadToken, storageSearchDebounced, storageSort, storageSourceFilter])

  // Fix offset if it's out of bounds after a load
  useEffect(() => {
    if (!storageResult) return
    if (storageTotal === 0 && storageOffset !== 0) {
      void setStorageOffset(0)
      return
    }
    if (storageOffset >= storageTotal && storageTotal > 0) {
      const previousPage = Math.max(0, Math.floor((storageTotal - 1) / STORAGE_PAGE_LIMIT) * STORAGE_PAGE_LIMIT)
      if (previousPage !== storageOffset) void setStorageOffset(previousPage)
    }
  }, [setStorageOffset, storageOffset, storageResult, storageTotal])

  // Cancel rename if the item disappears
  useEffect(() => {
    if (!renamingStorageId) return
    if (storageItems.some((item) => item.id === renamingStorageId)) return
    setRenamingStorageId(null)
    setArtifactRenameDraft("")
  }, [renamingStorageId, storageItems])

  async function uploadData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedDataFiles.length === 0) return
    setUploadingData(true)
    try {
      for (const file of selectedDataFiles) {
        const upload = await generateDataUploadUrlMutation({ filename: file.name, size_bytes: file.size })
        const response = await fetch(upload.url, {
          method: "PUT",
          headers: file.type ? { "Content-Type": file.type } : undefined,
          body: file,
        })
        if (!response.ok) throw new Error(`upload failed with status ${response.status}`)
        await syncDataMetadataMutation({ key: upload.key })
      }
      const count = selectedDataFiles.length
      setSelectedDataFiles([])
      setDataFileInputKey((n) => n + 1)
      setStorageReloadToken((n) => n + 1)
      toast.success(count === 1 ? "Uploaded 1 file." : `Uploaded ${count} files.`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unexpected error"
      toast.error(
        msg === "Failed to fetch"
          ? "Upload failed. Check the R2 bucket CORS policy for PUT requests from this app origin."
          : msg,
      )
    } finally {
      setUploadingData(false)
    }
  }

  async function setStorageVisibility(item: StorageItem, visibility: "shared" | "private") {
    try {
      await setStorageVisibilityMutation({ key: item.key, visibility })
      setStorageReloadToken((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to update visibility")
    }
  }

  function startRenameArtifact(item: StorageItem) {
    if (item.source !== "run_artifact") return
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
      toast.error("only run artifacts can be renamed")
      return
    }
    let nextName = ""
    try {
      nextName = validateArtifactRenameName(artifactRenameDraft)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "invalid artifact name")
      return
    }
    if (nextName === item.name) {
      toast.error("new artifact name must differ from the current name")
      return
    }
    setArtifactRenameBusyId(item.id)
    try {
      const renamed = await renameArtifactAction({
        runId: item.run_id as Id<"runs">,
        key: item.key,
        name: nextName,
      })
      setRenamingStorageId(null)
      setArtifactRenameDraft("")
      setStorageReloadToken((n) => n + 1)
      toast.success(
        renamed.cleanup_warning
          ? `Renamed artifact to ${renamed.name}. Old object cleanup needs a retry.`
          : `Renamed artifact to ${renamed.name}.`,
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to rename artifact")
    } finally {
      setArtifactRenameBusyId(null)
    }
  }

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
      onSelectDataFiles={(files) => {
        setSelectedDataFiles(files)
      }}
        onStorageSearchChange={(value) => {
          void setStorageSearch(value)
          void setStorageOffset(0)
        }}
        onStorageSourceFilterChange={(value) => {
          void setStorageSourceFilter(value)
          void setStorageOffset(0)
        }}
        onStorageSortChange={(value) => {
          void setStorageSort(value)
          void setStorageOffset(0)
        }}
        onArtifactRenameDraftChange={setArtifactRenameDraft}
        onSaveRenameArtifact={(item) => { void saveRenameArtifact(item) }}
        onCancelRenameArtifact={cancelRenameArtifact}
        onStartRenameArtifact={startRenameArtifact}
        onPreviousStoragePage={() => { void setStorageOffset(Math.max(0, storageOffset - STORAGE_PAGE_LIMIT)) }}
        onNextStoragePage={() => { void setStorageOffset(storageOffset + STORAGE_PAGE_LIMIT) }}
        onShareStorageItem={(item) => {
          if (item.source === "data" && item.data_blob_id) onOpenShareDialog("data", item.data_blob_id)
        }}
        onSetVisibility={(item, visibility) => { void setStorageVisibility(item, visibility) }}
      />
  )
}
