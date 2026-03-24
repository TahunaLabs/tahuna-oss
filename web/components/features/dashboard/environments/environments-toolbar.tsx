"use client"

import { ChevronDown, Folder, Grid2x2, List, Search } from "lucide-react"

import { FilterDropdown, type FilterDropdownOption } from "@/components/features/dashboard/environments/filter-dropdown"
import { ViewToggleButton } from "@/components/features/dashboard/environments/view-toggle-button"
import { Button } from "@/components/ui/button"
import { DashboardViewSwitcher } from "@/components/ui/dashboard-view-switcher"
import { Input } from "@/components/ui/input"

type EnvironmentsToolbarProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  accessFilter: string
  accessFilterOptions: FilterDropdownOption[]
  onAccessFilterChange: (value: string) => void
  runtimeFilter: string
  runtimeFilterOptions: FilterDropdownOption[]
  onRuntimeFilterChange: (value: string) => void
  deviceFilter: string
  deviceFilterOptions: FilterDropdownOption[]
  onDeviceFilterChange: (value: string) => void
  viewMode: "grid" | "table"
  onViewModeChange: (mode: "grid" | "table") => void
}

function EnvironmentsToolbar({
  searchQuery,
  onSearchChange,
  accessFilter,
  accessFilterOptions,
  onAccessFilterChange,
  runtimeFilter,
  runtimeFilterOptions,
  onRuntimeFilterChange,
  deviceFilter,
  deviceFilterOptions,
  onDeviceFilterChange,
  viewMode,
  onViewModeChange,
}: EnvironmentsToolbarProps) {
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
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search"
            className="w-full"
          />
        </div>
        <FilterDropdown
          ariaLabel="Access filter"
          value={accessFilter}
          options={accessFilterOptions}
          onSelect={onAccessFilterChange}
        />
        <FilterDropdown
          ariaLabel="Runtime filter"
          value={runtimeFilter}
          options={runtimeFilterOptions}
          onSelect={onRuntimeFilterChange}
        />
        <FilterDropdown
          ariaLabel="Device filter"
          value={deviceFilter}
          options={deviceFilterOptions}
          onSelect={onDeviceFilterChange}
        />
      </div>

      <div className="flex w-full items-center gap-2 md:w-auto md:shrink-0">
        <Button type="button" variant="outline" size="control" className="flex-1 md:flex-none">
          <Folder className="h-4 w-4" />
          All environments
          <ChevronDown className="h-4 w-4" />
        </Button>

        <div className="hidden md:block">
          <DashboardViewSwitcher>
            <legend className="sr-only">View mode</legend>
            <ViewToggleButton
              label="Grid view"
              active={viewMode === "grid"}
              onClick={() => onViewModeChange("grid")}
              icon={<Grid2x2 className="h-4 w-4" />}
            />
            <ViewToggleButton
              label="Table view"
              active={viewMode === "table"}
              onClick={() => onViewModeChange("table")}
              icon={<List className="h-4 w-4" />}
            />
          </DashboardViewSwitcher>
        </div>
      </div>
    </div>
  )
}

export { EnvironmentsToolbar }
