"use client"

import { Plus, Search } from "lucide-react"

import { FilterDropdown, type FilterDropdownOption } from "@/components/features/dashboard/environments/filter-dropdown"
import {
  STORAGE_SORT_VALUES,
  STORAGE_SOURCE_FILTER_VALUES,
  type StorageSort,
  type StorageSourceFilter,
} from "@/components/features/dashboard-model"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const SOURCE_LABELS: Record<StorageSourceFilter, string> = {
  all: "All storage",
  shared: "Shared",
  private: "Private",
}
const SOURCE_OPTIONS: FilterDropdownOption[] = STORAGE_SOURCE_FILTER_VALUES.map((value) => ({
  value,
  label: SOURCE_LABELS[value],
}))

const SORT_LABELS: Record<StorageSort, string> = {
  created_desc: "Newest first",
  created_asc: "Oldest first",
  name_asc: "Name A-Z",
  name_desc: "Name Z-A",
  size_desc: "Largest first",
  size_asc: "Smallest first",
}
const SORT_OPTIONS: FilterDropdownOption[] = STORAGE_SORT_VALUES.map((value) => ({
  value,
  label: SORT_LABELS[value],
}))

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
            variant="search"
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
