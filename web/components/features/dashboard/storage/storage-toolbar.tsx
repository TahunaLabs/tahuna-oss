"use client"

import { Plus, Search } from "lucide-react"

import { FilterDropdown, type FilterDropdownOption } from "@/components/features/dashboard/environments/filter-dropdown"
import { type StorageSort, type StorageSourceFilter } from "@/components/features/dashboard-model"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const SOURCE_OPTIONS: FilterDropdownOption[] = [
  { value: "all", label: "All storage" },
  { value: "shared", label: "Shared" },
  { value: "private", label: "Private" },
]

const SORT_OPTIONS: FilterDropdownOption[] = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "size_desc", label: "Largest first" },
  { value: "size_asc", label: "Smallest first" },
]

type StorageToolbarProps = {
  storageSearch: string
  onStorageSearchChange: (value: string) => void
  storageSourceFilter: StorageSourceFilter
  onStorageSourceFilterChange: (value: StorageSourceFilter) => void
  storageSort: StorageSort
  onStorageSortChange: (value: StorageSort) => void
  uploadingData: boolean
  onOpenUploadDrawer: () => void
}

function StorageToolbar({
  storageSearch,
  onStorageSearchChange,
  storageSourceFilter,
  onStorageSourceFilterChange,
  storageSort,
  onStorageSortChange,
  uploadingData,
  onOpenUploadDrawer,
}: StorageToolbarProps) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="flex w-full min-w-0 flex-col gap-2 md:flex-1 md:flex-row md:flex-wrap md:items-center">
        <div className="relative w-full md:min-w-52 md:max-w-72 md:grow">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="text"
            variant="dashboard-search"
            value={storageSearch}
            onChange={(event) => onStorageSearchChange(event.target.value)}
            placeholder="Search"
            className="w-full"
          />
        </div>
        <FilterDropdown
          ariaLabel="Visibility filter"
          value={storageSourceFilter}
          options={SOURCE_OPTIONS}
          onSelect={(value) => onStorageSourceFilterChange(value as StorageSourceFilter)}
        />
        <FilterDropdown
          ariaLabel="Sort order"
          value={storageSort}
          options={SORT_OPTIONS}
          onSelect={(value) => onStorageSortChange(value as StorageSort)}
        />
      </div>

      <div className="flex w-full items-center gap-2 md:w-auto md:shrink-0">
        <Button
          type="button"
          variant="outline"
          size="control"
          className="flex-1 md:flex-none"
          onClick={onOpenUploadDrawer}
          disabled={uploadingData}
        >
          <Plus className="h-4 w-4" />
          Upload data
        </Button>
      </div>
    </div>
  )
}

export { StorageToolbar }
