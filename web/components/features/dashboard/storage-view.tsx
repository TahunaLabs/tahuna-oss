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
import { StorageEmptyState } from "@/components/features/dashboard/storage/storage-empty-state"
import { StorageTableRow } from "@/components/features/dashboard/storage/storage-table-row"
import { StorageToolbar } from "@/components/features/dashboard/storage/storage-toolbar"
import { StorageUploadDrawer } from "@/components/features/dashboard/storage/storage-upload-drawer"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type StorageViewProps = {
  selectedDataFiles: File[]
  uploadingData: boolean
  uploadError: string
  uploadMessage: string
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
  uploadError,
  uploadMessage,
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
        uploadError={uploadError}
        uploadMessage={uploadMessage}
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
        <Card variant="surface" className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-w-0 flex-1 overflow-auto">
            <Table className="w-full table-fixed">
              <colgroup>
                <col className="w-96" />
                <col className="w-36" />
                <col className="w-28" />
                <col className="w-36" />
                <col className="w-48" />
              </colgroup>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow variant="head" className="text-left">
                  <TableHead>Name</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storageItems.map((item) => (
                  <StorageTableRow
                    key={item.id}
                    item={item}
                    renamingStorageId={renamingStorageId}
                    artifactRenameDraft={artifactRenameDraft}
                    artifactRenameBusyId={artifactRenameBusyId}
                    onArtifactRenameDraftChange={onArtifactRenameDraftChange}
                    onSaveRenameArtifact={onSaveRenameArtifact}
                    onCancelRenameArtifact={onCancelRenameArtifact}
                    onStartRenameArtifact={onStartRenameArtifact}
                    onShareStorageItem={onShareStorageItem}
                    onSetVisibility={onSetVisibility}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex h-11 shrink-0 items-center justify-between border-t border-border px-4 text-sm text-muted-foreground">
            <span>
              {storageTotal === 0 ? 0 : storageOffset + 1}–{storageOffset + storageItems.length} of {storageTotal}
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onPreviousStoragePage}
                disabled={storageOffset === 0}
              >
                <span className="-rotate-90 text-lg leading-none">‹</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onNextStoragePage}
                disabled={!storageHasMore}
              >
                <span className="rotate-90 text-lg leading-none">‹</span>
              </Button>
            </div>
          </div>
        </Card>
      )}
    </DashboardViewLayout>
  )
}
