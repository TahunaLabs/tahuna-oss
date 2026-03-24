"use client"

import { Search } from "lucide-react"

import { type RunTab } from "@/components/features/dashboard/runs-view"
import { FilterDropdown, type FilterDropdownOption } from "@/components/features/dashboard/environments/filter-dropdown"
import { Input } from "@/components/ui/input"

const STATUS_OPTIONS: FilterDropdownOption[] = [
  { value: "all", label: "All runs" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
]

type RunsToolbarProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  activeTab: RunTab
  activeCount: number
  onActiveTabChange: (tab: RunTab) => void
}

function RunsToolbar({
  searchQuery,
  onSearchChange,
  activeTab,
  activeCount,
  onActiveTabChange,
}: RunsToolbarProps) {
  const statusOptions: FilterDropdownOption[] = STATUS_OPTIONS.map((option) =>
    option.value === "active" && activeCount > 0
      ? { ...option, label: `Active (${activeCount})` }
      : option,
  )

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      <div className="relative w-full md:min-w-52 md:max-w-72 md:grow">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="text"
          variant="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
          className="w-full"
        />
      </div>
      <FilterDropdown
        ariaLabel="Status filter"
        value={activeTab}
        options={statusOptions}
        onSelect={(value) => onActiveTabChange(value as RunTab)}
      />
    </div>
  )
}

export { RunsToolbar }
