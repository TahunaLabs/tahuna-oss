"use client"

import { useState } from "react"
import {
  HardDrive,
  Plus,
  Filter,
  Settings2,
  LayoutGrid,
  ExternalLink,
  Download,
  Pencil,
  ChevronUp,
  ChevronDown,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  formatBytes,
  MAX_ARTIFACT_NAME_CHARS,
  type StorageItem,
  type StorageListResult,
  type StorageSort,
  type StorageSourceFilter,
} from "@/components/dashboard/shared"
import type { FormEvent } from "react"

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
}: StorageViewProps) {
  const [showFilters, setShowFilters] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const storageItems = storageResult?.items ?? []
  const storageTotal = storageResult?.total ?? 0
  const storageOffset = storageResult?.offset ?? 0
  const storageHasMore = storageResult?.has_more ?? false
  const hasData = storageItems.length > 0

  return (
    <main className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-foreground">Storage</h1>
          {storageTotal > 0 && (
            <span className="text-xs text-muted-foreground">{storageTotal}</span>
          )}
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
            variant="dashboard-icon-secondary"
            size="none"
          >
            <Settings2 className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="dashboard-icon-secondary"
            size="none"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant={showUpload ? "dashboard-icon-secondary-active" : "dashboard-icon-secondary"}
            size="none"
            onClick={() => setShowUpload(!showUpload)}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Filter bar */}
      {showFilters && (
        <div className="px-6 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={storageSearch}
                onChange={(e) => onStorageSearchChange(e.target.value)}
                placeholder="Search files..."
                className="h-8 w-48 rounded border border-border bg-secondary/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <select
                value={storageSort}
                onChange={(e) => onStorageSortChange(e.target.value as StorageSort)}
                className="h-8 rounded border border-border bg-secondary/50 px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="created_desc">Newest first</option>
                <option value="created_asc">Oldest first</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
                <option value="size_desc">Largest first</option>
                <option value="size_asc">Smallest first</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Upload panel */}
      {showUpload && (
        <div className="px-6 py-3 border-b border-border">
          <form onSubmit={onUploadData} className="flex items-center gap-3">
            <input
              key={dataFileInputKey}
              type="file"
              multiple
              disabled={uploadingData}
              onChange={(e) => onSelectDataFiles(Array.from(e.target.files ?? []))}
              className="text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-secondary/80"
            />
            {selectedDataFiles.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedDataFiles.length} file{selectedDataFiles.length > 1 ? "s" : ""} ({selectedDataFiles.map(f => formatBytes(f.size)).join(", ")})
              </span>
            )}
            <Button
              type="submit"
              variant="dashboard-primary-compact-sm"
              size="none"
              disabled={selectedDataFiles.length === 0 || uploadingData}
            >
              {uploadingData ? "Uploading..." : "Upload"}
            </Button>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div className="px-6 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={storageSourceFilter === "all" ? "dashboard-tab-compact-active" : "dashboard-tab-compact"}
            size="none"
            onClick={() => onStorageSourceFilterChange("all")}
          >
            All storage
          </Button>
          <Button
            type="button"
            variant={storageSourceFilter === "data" ? "dashboard-tab-compact-active" : "dashboard-tab-compact"}
            size="none"
            onClick={() => onStorageSourceFilterChange("data")}
          >
            Data
          </Button>
          <Button
            type="button"
            variant={storageSourceFilter === "run_artifact" ? "dashboard-tab-compact-active" : "dashboard-tab-compact"}
            size="none"
            onClick={() => onStorageSourceFilterChange("run_artifact")}
          >
            Artifacts
          </Button>
        </div>
      </div>

      {/* Content */}
      {storageResult === undefined && storageLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading storage...</p>
        </div>
      ) : storageError ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-destructive-foreground">{storageError}</p>
        </div>
      ) : !hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="flex justify-center mb-6">
              <HardDrive className="w-16 h-16 text-muted-foreground/50" strokeWidth={1} />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-3">Storage</h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
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
                  onClick={() => setShowUpload(true)}
                >
                  Upload data
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-2 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Source</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Size</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Created</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Reference</th>
                  <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {storageItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border hover:bg-secondary/50 group"
                  >
                    <td className="px-6 py-2.5">
                      <p className="text-sm text-foreground truncate">{item.name}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs bg-secondary text-foreground">
                        {item.source === "data" ? "Data" : "Artifact"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-sm text-muted-foreground">
                      {formatBytes(item.size)}
                    </td>
                    <td className="px-3 py-2.5 text-sm text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {item.source === "data" ? item.data_blob_id || "—" : item.run_id || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {renamingStorageId === item.id ? (
                        <form
                          className="flex items-center gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault()
                            onSaveRenameArtifact(item)
                          }}
                        >
                          <input
                            value={artifactRenameDraft}
                            onChange={(e) => onArtifactRenameDraftChange(e.target.value)}
                            disabled={artifactRenameBusyId === item.id}
                            maxLength={MAX_ARTIFACT_NAME_CHARS}
                            className="h-7 w-32 rounded border border-border bg-secondary/50 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
                        <div className="flex items-center gap-1">
                          <Button asChild type="button" variant="dashboard-outline-icon-muted" size="none">
                            <a href={item.download_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                          <Button asChild type="button" variant="dashboard-outline-icon-muted" size="none">
                            <a href={item.download_url} download={item.name}>
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                          {item.source === "data" && (
                            <Button
                              type="button"
                              variant="dashboard-outline-icon-muted"
                              size="none"
                              onClick={() => onStartRenameArtifact(item)}
                              disabled={artifactRenameBusyId !== null}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border px-6 h-10 text-sm text-muted-foreground shrink-0">
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
      )}
    </main>
  )
}
