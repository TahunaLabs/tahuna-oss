"use client"

import { useRef, useState } from "react"
import {
  HardDrive,
  Plus,
  Filter,
  ExternalLink,
  Download,
  Pencil,
  Share2,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react"
import { DashboardViewLayout } from "@/components/app-shell/layout-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import { Select } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  formatBytes,
  MAX_ARTIFACT_NAME_CHARS,
  type StorageItem,
  type StorageListResult,
  type StorageSort,
  type StorageSourceFilter,
} from "@/components/features/dashboard-model"
import { cn } from "@/lib/utils"
import type { FormEvent } from "react"

type StorageViewProps = {
  creditsLabel: string
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
  creditsLabel,
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
  const [showFilters, setShowFilters] = useState(false)
  const [showUploadDrawer, setShowUploadDrawer] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0
  const storageOffset = storageResult?.offset ?? 0
  const storageHasMore = storageResult?.has_more ?? false
  const hasData = storageItems.length > 0
  const selectedFileCount = selectedDataFiles.length
  const selectedTotalBytes = selectedDataFiles.reduce((total, file) => total + file.size, 0)

  function openUploadPicker() {
    if (uploadingData) return
    const input = fileInputRef.current
    if (!input) return
    input.value = ""
    input.click()
  }

  function openUploadDrawer(openPicker = false) {
    setShowUploadDrawer(true)
    if (openPicker) {
      openUploadPicker()
    }
  }

  function setUploadDrawerOpen(open: boolean) {
    if (!open && uploadingData) return
    setShowUploadDrawer(open)
  }

  return (
    <DashboardViewLayout
      sectionLabel="Storage"
      title="Storage"
      titleIcon={<HardDrive size={24} />}
      count={storageTotal > 0 ? storageTotal : undefined}
      creditsLabel={creditsLabel}
      toolbar={(
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="dashboard-tab-compact"
                size="none"
                className={cn("text-ui-tab", storageSourceFilter === "all" ? "text-foreground" : "text-muted-foreground")}
                onClick={() => onStorageSourceFilterChange("all")}
              >
                All storage
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="dashboard-tab-compact"
                size="none"
                className={cn("text-ui-tab", storageSourceFilter === "shared" ? "text-foreground" : "text-muted-foreground")}
                onClick={() => onStorageSourceFilterChange("shared")}
              >
                Shared
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="dashboard-tab-compact"
                size="none"
                className={cn("text-ui-tab", storageSourceFilter === "private" ? "text-foreground" : "text-muted-foreground")}
                onClick={() => onStorageSourceFilterChange("private")}
              >
                Private
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={showFilters ? "dashboard-icon-secondary-active" : "dashboard-icon-secondary"}
                size="none"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant={showUploadDrawer ? "dashboard-icon-secondary-active" : "dashboard-icon-secondary"}
                size="none"
                onClick={() => openUploadDrawer(true)}
                disabled={uploadingData}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {showFilters && (
            <div className="mt-3 flex items-center gap-3">
              <div className="flex flex-1 items-center gap-2">
                <Input
                  type="text"
                  variant="dashboard"
                  value={storageSearch}
                  onChange={(e) => onStorageSearchChange(e.target.value)}
                  placeholder="Search files..."
                  className="h-10 w-56 bg-background"
                />
                <Select
                  variant="dashboard"
                  value={storageSort}
                  onChange={(e) => onStorageSortChange(e.target.value as StorageSort)}
                  className="h-10 w-auto min-w-44 bg-background pr-8"
                >
                  <option value="created_desc">Newest first</option>
                  <option value="created_asc">Oldest first</option>
                  <option value="name_asc">Name A-Z</option>
                  <option value="name_desc">Name Z-A</option>
                  <option value="size_desc">Largest first</option>
                  <option value="size_asc">Smallest first</option>
                </Select>
              </div>
            </div>
          )}
        </>
      )}
    >
      <input
        key={dataFileInputKey}
        ref={fileInputRef}
        type="file"
        multiple
        disabled={uploadingData}
        onChange={(e) => onSelectDataFiles(Array.from(e.target.files ?? []))}
        className="hidden"
      />

      {/* Content */}
      {storageResult === undefined && storageLoading ? (
        <div>
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading storage...</p>
          </div>
        </div>
      ) : storageError ? (
        <div>
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-destructive-foreground">{storageError}</p>
          </div>
        </div>
      ) : !hasData ? (
        <div>
          <div className="flex h-full items-center justify-center">
            <div className="max-w-md text-center">
              <div className="mb-6 flex justify-center">
                <HardDrive className="h-16 w-16 text-muted-foreground/50" strokeWidth={1} />
              </div>
              <h2 className="mb-3 text-lg font-medium text-foreground">Storage</h2>
              <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                {storageSearch.trim() || storageSourceFilter !== "all"
                  ? "No storage items match your current filters."
                  : "Manage your storage buckets and artifacts. Store and organize files, build outputs, and other assets for your projects."}
              </p>
              {!storageSearch.trim() && storageSourceFilter === "all" && (
                <div className="flex items-center justify-center gap-3">
                  <Button
                    type="button"
                    variant="dashboard-primary-compact"
                    size="none"
                    onClick={() => openUploadDrawer(true)}
                  >
                    Upload data
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex-1 overflow-auto">
              <Table variant="dashboard" className="table-fixed">
              <colgroup>
                <col className="w-[380px]" />
                <col className="w-[140px]" />
                <col className="w-[120px]" />
                <col className="w-[140px]" />
                <col className="w-[200px]" />
              </colgroup>
                <TableHeader variant="dashboard" className="sticky top-0 bg-background">
                  <TableRow variant="dashboard-head" className="text-left">
                    <TableHead variant="dashboard">Name</TableHead>
                    <TableHead variant="dashboard">Visibility</TableHead>
                    <TableHead variant="dashboard">Size</TableHead>
                    <TableHead variant="dashboard">Created</TableHead>
                    <TableHead variant="dashboard">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {storageItems.map((item) => (
                  <TableRow
                    key={item.id}
                    variant="dashboard"
                    className="group hover:bg-secondary/50"
                  >
                    <TableCell variant="dashboard">
                      {renamingStorageId === item.id ? (
                        <form
                          className="flex items-center gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault()
                            onSaveRenameArtifact(item)
                          }}
                        >
                          <Input
                            type="text"
                            variant="dashboard"
                            value={artifactRenameDraft}
                            onChange={(e) => onArtifactRenameDraftChange(e.target.value)}
                            disabled={artifactRenameBusyId === item.id}
                            maxLength={MAX_ARTIFACT_NAME_CHARS}
                            className="h-7 w-40 bg-secondary/50 px-2 text-dashboard-control-small"
                          />
                          <Button
                            type="submit"
                            variant="dashboard-outline-compact"
                            size="none"
                            disabled={artifactRenameBusyId === item.id}
                          >
                            {artifactRenameBusyId === item.id ? "..." : "Save"}
                          </Button>
                          <Button
                            type="button"
                            variant="dashboard-outline-icon-muted"
                            size="none"
                            disabled={artifactRenameBusyId === item.id}
                            onClick={onCancelRenameArtifact}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-foreground">{item.name}</p>
                          <div className="shrink-0">
                            <ActionsMenu triggerLabel={`Open actions for ${item.name}`}>
                              {(close) => (
                                <>
                                  <Button
                                    asChild
                                    type="button"
                                    variant="sidebar-menu-item"
                                    size="none"
                                  >
                                    <a
                                      href={item.download_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={() => close()}
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Open
                                    </a>
                                  </Button>
                                  <Button
                                    asChild
                                    type="button"
                                    variant="sidebar-menu-item"
                                    size="none"
                                  >
                                    <a href={item.download_url} download={item.name} onClick={() => close()}>
                                      <Download className="w-3.5 h-3.5" />
                                      Download
                                    </a>
                                  </Button>
                                  {item.source === "run_artifact" && (
                                    <Button
                                      type="button"
                                      variant="sidebar-menu-item"
                                      size="none"
                                      onClick={() => {
                                        close()
                                        onStartRenameArtifact(item)
                                      }}
                                      disabled={artifactRenameBusyId !== null}
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                      Rename
                                    </Button>
                                  )}
                                  {item.source === "data" && onShareStorageItem && (
                                    <Button
                                      type="button"
                                      variant="sidebar-menu-item"
                                      size="none"
                                      onClick={() => {
                                        close()
                                        onShareStorageItem(item)
                                      }}
                                    >
                                      <Share2 className="w-3.5 h-3.5" />
                                      Share
                                    </Button>
                                  )}
                                </>
                              )}
                            </ActionsMenu>
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell variant="dashboard">
                      <Button
                        type="button"
                        variant={item.visibility === "shared" ? "dashboard-outline-compact-active" : "dashboard-outline-compact"}
                        size="none"
                        onClick={() => onSetVisibility?.(item, item.visibility === "shared" ? "private" : "shared")}
                        disabled={!onSetVisibility}
                      >
                        {item.visibility === "shared" ? "Shared" : "Private"}
                      </Button>
                    </TableCell>
                    <TableCell variant="dashboard" className="text-muted-foreground">
                      {formatBytes(item.size)}
                    </TableCell>
                    <TableCell variant="dashboard" className="text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell variant="dashboard" className="text-muted-foreground">
                      {item.source === "data" ? "Data upload" : "Run artifact"}
                    </TableCell>
                  </TableRow>
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
                  variant="dashboard-outline-icon-muted"
                  size="none"
                  onClick={onPreviousStoragePage}
                  disabled={storageOffset === 0}
                >
                  <ChevronUp className="w-4 h-4 -rotate-90" />
                </Button>
                <Button
                  type="button"
                  variant="dashboard-outline-icon-muted"
                  size="none"
                  onClick={onNextStoragePage}
                  disabled={!storageHasMore}
                >
                  <ChevronDown className="w-4 h-4 -rotate-90" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Sheet open={showUploadDrawer} onOpenChange={setUploadDrawerOpen}>
        <SheetContent side="right" className="w-full max-w-sm p-0">
          <form onSubmit={onUploadData} className="flex h-full flex-col">
            <div className="border-b border-border px-4 py-3">
              <SheetHeader>
                <SheetTitle>Upload files</SheetTitle>
                <SheetDescription>Data uploads for storage</SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
              <p className="text-sm text-foreground">
                {selectedFileCount > 0
                  ? `${selectedFileCount} file${selectedFileCount > 1 ? "s" : ""} selected (${formatBytes(selectedTotalBytes)})`
                  : "No files selected"}
              </p>

              {uploadError ? (
                <p className="mt-2 rounded border border-red-400/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-400">
                  {uploadError}
                </p>
              ) : null}
              {!uploadError && uploadMessage ? (
                <p className="mt-2 rounded border border-border bg-secondary/40 px-2.5 py-2 text-xs text-muted-foreground">
                  {uploadMessage}
                </p>
              ) : null}

              {selectedFileCount > 0 ? (
                <div className="mt-3 min-h-0 flex-1 rounded border border-border">
                  <ul className="h-full divide-y divide-border overflow-y-auto">
                    {selectedDataFiles.map((file) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                        className="flex items-center justify-between gap-3 px-2.5 py-2 text-xs"
                      >
                        <span className="min-w-0 truncate text-foreground">{file.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  Choose files to start an upload. Errors will stay in this drawer for quick retry.
                </p>
              )}
            </div>

            <SheetFooter className="justify-between gap-2 border-t border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="dashboard-outline-compact"
                  size="none"
                  onClick={openUploadPicker}
                  disabled={uploadingData}
                >
                  Choose files
                </Button>
                <Button
                  type="button"
                  variant="dashboard-outline-icon-muted"
                  size="none"
                  onClick={() => onSelectDataFiles([])}
                  disabled={uploadingData || selectedFileCount === 0}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              <Button
                type="submit"
                variant="dashboard-primary-compact-sm"
                size="none"
                className="min-w-20"
                disabled={selectedFileCount === 0 || uploadingData}
              >
                {uploadingData ? "Uploading..." : "Upload"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </DashboardViewLayout>
  )
}
