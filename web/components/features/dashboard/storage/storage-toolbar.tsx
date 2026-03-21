"use client"

import { Filter, Plus } from "lucide-react"

import { DashboardTabButton } from "@/components/features/dashboard/dashboard-tab-button"
import { type StorageSort, type StorageSourceFilter } from "@/components/features/dashboard-model"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

type StorageToolbarProps = {
  storageSourceFilter: StorageSourceFilter
  onStorageSourceFilterChange: (value: StorageSourceFilter) => void
  showFilters: boolean
  onToggleFilters: () => void
  uploadingData: boolean
  onOpenUploadDrawer: () => void
  storageSearch: string
  onStorageSearchChange: (value: string) => void
  storageSort: StorageSort
  onStorageSortChange: (value: StorageSort) => void
}

function StorageToolbar({
  storageSourceFilter,
  onStorageSourceFilterChange,
  showFilters,
  onToggleFilters,
  uploadingData,
  onOpenUploadDrawer,
  storageSearch,
  onStorageSearchChange,
  storageSort,
  onStorageSortChange,
}: StorageToolbarProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <DashboardTabButton
            label="All storage"
            active={storageSourceFilter === "all"}
            onClick={() => onStorageSourceFilterChange("all")}
          />
          <DashboardTabButton
            label="Shared"
            active={storageSourceFilter === "shared"}
            onClick={() => onStorageSourceFilterChange("shared")}
          />
          <DashboardTabButton
            label="Private"
            active={storageSourceFilter === "private"}
            onClick={() => onStorageSourceFilterChange("private")}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={showFilters ? "dashboard-icon-secondary-active" : "dashboard-icon-secondary"}
            size="none"
            onClick={onToggleFilters}
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={uploadingData ? "dashboard-icon-secondary-active" : "dashboard-icon-secondary"}
            size="none"
            onClick={onOpenUploadDrawer}
            disabled={uploadingData}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showFilters ? (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <Input
              type="text"
              variant="dashboard"
              value={storageSearch}
              onChange={(e) => onStorageSearchChange(e.target.value)}
              placeholder="Search files..."
              className="w-56 bg-background"
            />
            <Select
              variant="dashboard"
              value={storageSort}
              onChange={(e) => onStorageSortChange(e.target.value as StorageSort)}
              className="w-auto min-w-44 bg-background pr-8"
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
      ) : null}
    </>
  )
}

export { StorageToolbar }
