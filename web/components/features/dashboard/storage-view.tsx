"use client"

import { HardDrive } from "lucide-react"
import { useRef, useState } from "react"
import type { FormEvent } from "react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import {
  type StorageItem,
  type StorageListResult,
  type StorageSort,
  type StorageSourceFilter,
} from "@/components/features/dashboard-model"
import { StorageTableView } from "@/components/features/dashboard/storage/storage-table-view"
import { StorageEmptyState } from "@/components/features/dashboard/storage/storage-empty-state"
import { StorageToolbar } from "@/components/features/dashboard/storage/storage-toolbar"
import { StorageUploadDrawer } from "@/components/features/dashboard/storage/storage-upload-drawer"
import { Spinner } from "@/components/ui/spinner"

type StorageViewProps = {
  selectedDataFiles: File[]
  uploadingData: boolean
  dataFileInputKey: number
  storageSearch: string
  storageSourceFilter: StorageSourceFilter
  storageSort: StorageSort
  storageResult: StorageListResult | undefined
  storageLoading: boolean
  storageError: string
  renamingStorageId: string | null
  artifactRenameDraft: string
  artifactRenameBusyId: string | null
  onUploadData: (event: FormEvent<HTMLFormElement>) => void
  onSelectDataFiles: (files: File[]) => void
  onStorageSearchChange: (value: string) => void
  onStorageSourceFilterChange: (value: StorageSourceFilter) => void
  onStorageSortChange: (value: StorageSort) => void
  onArtifactRenameDraftChange: (value: string) => void
  onSaveRenameArtifact: (item: StorageItem) => void
  onCancelRenameArtifact: () => void
  onStartRenameArtifact: (item: StorageItem) => void
  onPreviousStoragePage: () => void
  onNextStoragePage: () => void
  onShareStorageItem?: (item: StorageItem) => void
  onSetVisibility?: (item: StorageItem, visibility: "shared" | "private") => void
}

export function StorageView({
  selectedDataFiles,
  uploadingData,
  dataFileInputKey,
  storageSearch,
  storageSourceFilter,
  storageSort,
  storageResult,
  storageLoading,
  storageError,
  renamingStorageId,
  artifactRenameDraft,
  artifactRenameBusyId,
  onUploadData,
  onSelectDataFiles,
  onStorageSearchChange,
  onStorageSourceFilterChange,
  onStorageSortChange,
  onArtifactRenameDraftChange,
  onSaveRenameArtifact,
  onCancelRenameArtifact,
  onStartRenameArtifact,
  onPreviousStoragePage,
  onNextStoragePage,
  onShareStorageItem,
  onSetVisibility,
}: StorageViewProps) {
  const [showUploadDrawer, setShowUploadDrawer] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0
  const storageOffset = storageResult?.offset ?? 0
  const storageHasMore = storageResult?.has_more ?? false
  const hasFilters = Boolean(storageSearch.trim()) || storageSourceFilter !== "all"

  function openFilePicker() {
    if (uploadingData) return
    const input = fileInputRef.current
    if (!input) return
    input.value = ""
    input.click()
  }

  function openUploadDrawer() {
    setShowUploadDrawer(true)
    openFilePicker()
  }

  function handleDrawerOpenChange(open: boolean) {
    if (!open && uploadingData) return
    setShowUploadDrawer(open)
  }

  return (
    <DashboardViewLayout
      sectionLabel="Storage"
      title="Storage"
      titleIcon={<HardDrive size={24} />}
      count={storageTotal > 0 ? storageTotal : undefined}
      toolbar={(
        <StorageToolbar
          storageSearch={storageSearch}
          onStorageSearchChange={onStorageSearchChange}
          storageSourceFilter={storageSourceFilter}
          onStorageSourceFilterChange={onStorageSourceFilterChange}
          storageSort={storageSort}
          onStorageSortChange={onStorageSortChange}
          uploadingData={uploadingData}
          onOpenUploadDrawer={openUploadDrawer}
        />
      )}
    >
      <StorageUploadDrawer
        open={showUploadDrawer}
        onOpenChange={handleDrawerOpenChange}
        fileInputRef={fileInputRef}
        dataFileInputKey={dataFileInputKey}
        selectedDataFiles={selectedDataFiles}
        uploadingData={uploadingData}
        onUploadData={onUploadData}
        onSelectDataFiles={onSelectDataFiles}
        onOpenFilePicker={openFilePicker}
      />

      {storageResult === undefined && storageLoading ? (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading storage…</p>
        </div>
      ) : storageError ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-destructive-foreground">{storageError}</p>
        </div>
      ) : storageItems.length === 0 ? (
        <StorageEmptyState hasFilters={hasFilters} onUpload={openUploadDrawer} />
      ) : (
        <StorageTableView
          items={storageItems}
          total={storageTotal}
          offset={storageOffset}
          hasMore={storageHasMore}
          renamingStorageId={renamingStorageId}
          artifactRenameDraft={artifactRenameDraft}
          artifactRenameBusyId={artifactRenameBusyId}
          onArtifactRenameDraftChange={onArtifactRenameDraftChange}
          onSaveRenameArtifact={onSaveRenameArtifact}
          onCancelRenameArtifact={onCancelRenameArtifact}
          onStartRenameArtifact={onStartRenameArtifact}
          onPreviousPage={onPreviousStoragePage}
          onNextPage={onNextStoragePage}
          onShareStorageItem={onShareStorageItem}
          onSetVisibility={onSetVisibility}
        />
      )}
    </DashboardViewLayout>
  )
}
