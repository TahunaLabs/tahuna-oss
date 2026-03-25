"use client"

import { Server } from "lucide-react"
import { useState } from "react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import {
  ENVIRONMENT_ACCESS_FILTER_VALUES,
  type DataBlobRow,
  type EnvironmentAccessFilter,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import { formatGpuLabel } from "@/components/features/dashboard/environments/environment-card"
import { EnvironmentsEmptyState } from "@/components/features/dashboard/environments/environments-empty-state"
import { type EnvironmentConfigEditor, EnvironmentsGridView } from "@/components/features/dashboard/environments/environments-grid-view"
import { EnvironmentsTableView } from "@/components/features/dashboard/environments/environments-table-view"
import { EnvironmentsToolbar } from "@/components/features/dashboard/environments/environments-toolbar"
import { type FilterDropdownOption } from "@/components/features/dashboard/environments/filter-dropdown"

const ACCESS_FILTER_LABELS: Record<EnvironmentAccessFilter, string> = {
  all: "Any access",
  private: "Private",
  shared: "Shared",
}
const ACCESS_FILTER_OPTIONS: FilterDropdownOption[] = ENVIRONMENT_ACCESS_FILTER_VALUES.map((value) => ({
  value,
  label: ACCESS_FILTER_LABELS[value],
}))
import { Spinner } from "@/components/ui/spinner"

type EnvironmentsViewProps = {
  environments: EnvironmentRow[]
  uniqueDataBlobs: DataBlobRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  bindSelectionByEnvironment: Record<string, string>
  busy: boolean
  environmentsLoading: boolean
  configEditorEnvironmentId: string | null
  configEditor: EnvironmentConfigEditor
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow, dataId: string) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
  onLaunchRun: (environmentId: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onDeleteEnvironments: (environmentIds: EnvironmentRow["environment_id"][]) => Promise<boolean>
  sharedByMeResourceIds?: ReadonlySet<string>
  onShareEnvironment?: (environmentId: string) => void
}

export function EnvironmentsView({
  environments,
  uniqueDataBlobs,
  dataBlobsById,
  bindSelectionByEnvironment,
  busy,
  environmentsLoading,
  configEditorEnvironmentId,
  configEditor,
  onBindSelectionChange,
  onBindSelectedData,
  onUnbindData,
  onLaunchRun,
  onOpenConfigEditor,
  onDeleteEnvironments,
  sharedByMeResourceIds,
  onShareEnvironment,
}: EnvironmentsViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const [accessFilter, setAccessFilter] = useState<EnvironmentAccessFilter>("all")
  const [runtimeFilter, setRuntimeFilter] = useState("all")
  const [deviceFilter, setDeviceFilter] = useState("all")

  const accessFilterOptions = ACCESS_FILTER_OPTIONS

  const runtimeOptions = new Set<string>()
  for (const environment of environments) {
    runtimeOptions.add(`${environment.framework}:${environment.version}`)
  }
  const runtimeFilterOptions: FilterDropdownOption[] = [
    { value: "all", label: "Any runtime" },
    ...Array.from(runtimeOptions).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
  ]

  const deviceOptions = new Set<string>()
  for (const environment of environments) {
    deviceOptions.add(environment.gpu_type)
  }
  const deviceFilterOptions: FilterDropdownOption[] = [
    { value: "all", label: "Any device" },
    ...Array.from(deviceOptions)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: formatGpuLabel(value) })),
  ]

  const query = searchQuery.trim().toLowerCase()
  const visibleEnvironments = environments.filter((environment) => {
    const runtimeLabel = `${environment.framework}:${environment.version}`
    const searchTarget = [environment.name, runtimeLabel, environment.gpu_type, environment.access]
      .join(" ")
      .toLowerCase()
    if (query && !searchTarget.includes(query)) return false
    if (accessFilter !== "all" && environment.access !== accessFilter) return false
    if (runtimeFilter !== "all" && runtimeLabel !== runtimeFilter) return false
    if (deviceFilter !== "all" && environment.gpu_type !== deviceFilter) return false
    return true
  })

  const sharedProps = {
    configEditor,
    busy,
    onDeleteEnvironments,
    onLaunchRun,
    onOpenConfigEditor,
    onShareEnvironment,
  }

  return (
    <DashboardViewLayout
      sectionLabel="Environments"
      title="Environments"
      titleIcon={<Server size={24} />}
      rightContent={null}
      toolbar={(
        <EnvironmentsToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          accessFilter={accessFilter}
          accessFilterOptions={accessFilterOptions}
          onAccessFilterChange={(v) => setAccessFilter(v as EnvironmentAccessFilter)}
          runtimeFilter={runtimeFilter}
          runtimeFilterOptions={runtimeFilterOptions}
          onRuntimeFilterChange={setRuntimeFilter}
          deviceFilter={deviceFilter}
          deviceFilterOptions={deviceFilterOptions}
          onDeviceFilterChange={setDeviceFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}
    >
      {environmentsLoading ? (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading environments…</p>
        </div>
      ) : environments.length === 0 ? (
        <EnvironmentsEmptyState />
      ) : visibleEnvironments.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No environments match your current filters.</p>
        </div>
      ) : (
        <>
          <div className="md:hidden">
            <EnvironmentsGridView
              environments={visibleEnvironments}
              dataBlobsById={dataBlobsById}
              configEditorEnvironmentId={configEditorEnvironmentId}
              sharedByMeResourceIds={sharedByMeResourceIds}
              {...sharedProps}
            />
          </div>
          <div className="hidden md:block">
            {viewMode === "grid" ? (
              <EnvironmentsGridView
                environments={visibleEnvironments}
                dataBlobsById={dataBlobsById}
                configEditorEnvironmentId={configEditorEnvironmentId}
                sharedByMeResourceIds={sharedByMeResourceIds}
                {...sharedProps}
              />
            ) : (
              <EnvironmentsTableView
                environments={visibleEnvironments}
                uniqueDataBlobs={uniqueDataBlobs}
                dataBlobsById={dataBlobsById}
                bindSelectionByEnvironment={bindSelectionByEnvironment}
                configEditorEnvironmentId={configEditorEnvironmentId}
                sharedByMeResourceIds={sharedByMeResourceIds}
                onBindSelectionChange={onBindSelectionChange}
                onBindSelectedData={onBindSelectedData}
                onUnbindData={onUnbindData}
                {...sharedProps}
              />
            )}
          </div>
        </>
      )}
    </DashboardViewLayout>
  )
}
