"use client"

import { useEffect, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { StorageView } from "@/components/features/dashboard/storage-view"
import { useArtifactRename } from "@/components/features/dashboard/storage/use-artifact-rename"
import { useStorageUpload } from "@/components/features/dashboard/storage/use-storage-upload"
import {
  STORAGE_PAGE_LIMIT,
  STORAGE_SORT_VALUES,
  STORAGE_SOURCE_FILTER_VALUES,
  type StorageItem,
  type StorageListResult,
} from "@/components/features/dashboard-model"
import { useDebounce } from "@/lib/use-debounce"


type Props = {
  shouldLoadQueries: boolean
  onOpenShareDialog: (resourceType: "data", resourceId: string) => void
}

export function StorageContainer({ shouldLoadQueries, onOpenShareDialog }: Props) {
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
  const storageSearchDebounced = useDebounce(storageSearch, 250)
  const [storageResult, setStorageResult] = useState<StorageListResult | undefined>(undefined)
  const [storageLoading, setStorageLoading] = useState(false)
  const [storageError, setStorageError] = useState("")
  const [storageReloadToken, setStorageReloadToken] = useState(0)
  const [storageDeleteBusy, setStorageDeleteBusy] = useState(false)

  const listStorageAction = useAction(api.storage.list)
  const deleteStorageMutation = useMutation(api.storage.deleteMany)
  const setStorageVisibilityMutation = useMutation(api.storage.setVisibility)

  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0

  const upload = useStorageUpload({ onSuccess: () => setStorageReloadToken((n) => n + 1) })
  const rename = useArtifactRename({ storageItems, onSuccess: () => setStorageReloadToken((n) => n + 1) })

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

  async function setStorageVisibility(item: StorageItem, visibility: "shared" | "private") {
    try {
      await setStorageVisibilityMutation({ key: item.key, visibility })
      setStorageReloadToken((n) => n + 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to update visibility")
    }
  }

  async function deleteStorageItems(items: StorageItem[]) {
    const keys = Array.from(new Set(items.map((item) => item.key)))
    if (keys.length === 0 || storageDeleteBusy) return false
    setStorageDeleteBusy(true)
    try {
      const result = await deleteStorageMutation({ keys })
      if (result.deleted > 0) {
        setStorageReloadToken((n) => n + 1)
      }
      return result.deleted === keys.length
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "failed to delete storage items")
      return false
    } finally {
      setStorageDeleteBusy(false)
    }
  }

  return (
    <StorageView
      bootstrapping={!shouldLoadQueries}
      selectedDataFiles={upload.selectedFiles}
      uploadingData={upload.uploading}
      dataFileInputKey={upload.fileInputKey}
      storageSearch={storageSearch}
      storageSourceFilter={storageSourceFilter}
      storageSort={storageSort}
      storageResult={storageResult}
      storageLoading={storageLoading}
      storageError={storageError}
      storageDeleteBusy={storageDeleteBusy}
      renamingStorageId={rename.renamingId}
      artifactRenameDraft={rename.renameDraft}
      artifactRenameBusyId={rename.renameBusyId}
      onUploadData={upload.onUpload}
      onSelectDataFiles={upload.onSelectFiles}
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
      onArtifactRenameDraftChange={rename.onDraftChange}
      onSaveRenameArtifact={(item) => { void rename.onSave(item) }}
      onCancelRenameArtifact={rename.onCancel}
      onStartRenameArtifact={rename.onStart}
      onPreviousStoragePage={() => { void setStorageOffset(Math.max(0, storageOffset - STORAGE_PAGE_LIMIT)) }}
      onNextStoragePage={() => { void setStorageOffset(storageOffset + STORAGE_PAGE_LIMIT) }}
      onShareStorageItem={(item) => {
        if (item.source === "data" && item.data_blob_id) onOpenShareDialog("data", item.data_blob_id)
      }}
      onDeleteStorageItems={(items) => deleteStorageItems(items)}
      onSetVisibility={(item, visibility) => { void setStorageVisibility(item, visibility) }}
    />
  )
}
