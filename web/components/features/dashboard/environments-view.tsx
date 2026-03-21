"use client"

import { Server } from "lucide-react"
import { useMemo, useState } from "react"

import { DashboardViewLayout } from "@/components/app-shell/layout-shell"
import {
  type DataBlobRow,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import { EnvironmentCard, formatGpuLabel } from "@/components/features/dashboard/environments/environment-card"
import { EnvironmentTableRow } from "@/components/features/dashboard/environments/environment-table-row"
import { EnvironmentsEmptyState } from "@/components/features/dashboard/environments/environments-empty-state"
import { EnvironmentsToolbar } from "@/components/features/dashboard/environments/environments-toolbar"
import { type FilterDropdownOption } from "@/components/features/dashboard/environments/filter-dropdown"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type EnvironmentsViewProps = {
  environments: EnvironmentRow[]
  uniqueDataBlobs: DataBlobRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  bindSelectionByEnvironment: Record<string, string>
  busy: boolean
  environmentsLoading: boolean
  configEditorEnvironmentId: string | null
  configName: string
  configDraft: string
  configSourceText: string
  configError: string
  configLoading: boolean
  configSaving: boolean
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow, dataId: string) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
  onLaunchRun: (environmentId: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onCloseConfigEditor: () => void
  onConfigDraftChange: (value: string) => void
  onCancelConfigEdit: () => void
  onSaveConfig: (environmentId: EnvironmentRow["environment_id"]) => void
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
  configName,
  configDraft,
  configSourceText,
  configError,
  configLoading,
  configSaving,
  onBindSelectionChange,
  onBindSelectedData,
  onUnbindData,
  onLaunchRun,
  onOpenConfigEditor,
  onCloseConfigEditor,
  onConfigDraftChange,
  onCancelConfigEdit,
  onSaveConfig,
  onDeleteEnvironments,
  sharedByMeResourceIds,
  onShareEnvironment,
}: EnvironmentsViewProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const [accessFilter, setAccessFilter] = useState<"all" | "private" | "shared">("all")
  const [runtimeFilter, setRuntimeFilter] = useState("all")
  const [deviceFilter, setDeviceFilter] = useState("all")

  const accessFilterOptions = useMemo<FilterDropdownOption[]>(() => [
    { value: "all", label: "Any access" },
    { value: "private", label: "Private" },
    { value: "shared", label: "Shared" },
  ], [])

  const runtimeFilterOptions = useMemo<FilterDropdownOption[]>(() => {
    const options = new Set<string>()
    for (const environment of environments) {
      options.add(`${environment.framework}:${environment.version}`)
    }
    return [
      { value: "all", label: "Any runtime" },
      ...Array.from(options).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value })),
    ]
  }, [environments])

  const deviceFilterOptions = useMemo<FilterDropdownOption[]>(() => {
    const options = new Set<string>()
    for (const environment of environments) {
      options.add(environment.gpu_type)
    }
    return [
      { value: "all", label: "Any device" },
      ...Array.from(options)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: formatGpuLabel(value) })),
    ]
  }, [environments])

  const visibleEnvironments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return environments.filter((environment) => {
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
  }, [accessFilter, deviceFilter, environments, runtimeFilter, searchQuery])

  const sharedConfigProps = {
    configName,
    configDraft,
    configSourceText,
    configError,
    configLoading,
    configSaving,
    busy,
    onCloseConfigEditor,
    onDeleteEnvironments,
    onLaunchRun,
    onOpenConfigEditor,
    onShareEnvironment,
    onConfigDraftChange,
    onCancelConfigEdit,
    onSaveConfig,
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
          onAccessFilterChange={(v) => setAccessFilter(v as "all" | "private" | "shared")}
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
            <EnvironmentGridView
              environments={visibleEnvironments}
              dataBlobsById={dataBlobsById}
              configEditorEnvironmentId={configEditorEnvironmentId}
              sharedByMeResourceIds={sharedByMeResourceIds}
              {...sharedConfigProps}
            />
          </div>
          <div className="hidden md:block">
            {viewMode === "grid" ? (
              <EnvironmentGridView
                environments={visibleEnvironments}
                dataBlobsById={dataBlobsById}
                configEditorEnvironmentId={configEditorEnvironmentId}
                sharedByMeResourceIds={sharedByMeResourceIds}
                {...sharedConfigProps}
              />
            ) : (
              <EnvironmentTableView
                environments={visibleEnvironments}
                uniqueDataBlobs={uniqueDataBlobs}
                dataBlobsById={dataBlobsById}
                bindSelectionByEnvironment={bindSelectionByEnvironment}
                configEditorEnvironmentId={configEditorEnvironmentId}
                sharedByMeResourceIds={sharedByMeResourceIds}
                onBindSelectionChange={onBindSelectionChange}
                onBindSelectedData={onBindSelectedData}
                onUnbindData={onUnbindData}
                {...sharedConfigProps}
              />
            )}
          </div>
        </>
      )}
    </DashboardViewLayout>
  )
}

// ─── Grid view ────────────────────────────────────────────────────────────────

type GridViewProps = {
  environments: EnvironmentRow[]
  dataBlobsById: ReadonlyMap<string, DataBlobRow>
  configEditorEnvironmentId: string | null
  sharedByMeResourceIds?: ReadonlySet<string>
  configName: string
  configDraft: string
  configSourceText: string
  configError: string
  configLoading: boolean
  configSaving: boolean
  busy: boolean
  onCloseConfigEditor: () => void
  onDeleteEnvironments: (ids: EnvironmentRow["environment_id"][]) => Promise<boolean>
  onLaunchRun: (id: EnvironmentRow["environment_id"]) => void
  onOpenConfigEditor: (environment: EnvironmentRow) => void
  onShareEnvironment?: (id: string) => void
  onConfigDraftChange: (value: string) => void
  onCancelConfigEdit: () => void
  onSaveConfig: (id: EnvironmentRow["environment_id"]) => void
}

function EnvironmentGridView({ environments, dataBlobsById, configEditorEnvironmentId, sharedByMeResourceIds, ...cardProps }: GridViewProps) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {environments.map((environment) => (
        <EnvironmentCard
          key={environment.environment_id}
          environment={environment}
          dataBlobsById={dataBlobsById}
          isShared={environment.access === "shared" || Boolean(sharedByMeResourceIds?.has(environment.environment_id))}
          configOpen={configEditorEnvironmentId === environment.environment_id}
          {...cardProps}
        />
      ))}
    </div>
  )
}

// ─── Table view ───────────────────────────────────────────────────────────────

type TableViewProps = GridViewProps & {
  uniqueDataBlobs: DataBlobRow[]
  bindSelectionByEnvironment: Record<string, string>
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow, dataId: string) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
}

function EnvironmentTableView({
  environments,
  uniqueDataBlobs,
  dataBlobsById,
  bindSelectionByEnvironment,
  configEditorEnvironmentId,
  sharedByMeResourceIds,
  onBindSelectionChange,
  onBindSelectedData,
  onUnbindData,
  ...rowProps
}: TableViewProps) {
  return (
    <Card variant="dashboard-surface" className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-auto">
        <Table variant="dashboard" className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "36px" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "10%" }} className="hidden lg:table-column" />
            <col style={{ width: "24%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} className="hidden xl:table-column" />
            <col style={{ width: "75px" }} />
          </colgroup>
          <TableHeader variant="dashboard" className="sticky top-0 bg-background">
            <TableRow variant="dashboard-head" className="text-left">
              <TableHead variant="dashboard" className="px-0" />
              <TableHead variant="dashboard" className="min-w-36">Name</TableHead>
              <TableHead variant="dashboard" className="hidden min-w-24 lg:table-cell">Access</TableHead>
              <TableHead variant="dashboard" className="min-w-44">Data</TableHead>
              <TableHead variant="dashboard" className="min-w-36">Device</TableHead>
              <TableHead variant="dashboard" className="min-w-32">Runtime</TableHead>
              <TableHead variant="dashboard" className="min-w-24">Last updated</TableHead>
              <TableHead variant="dashboard" className="hidden min-w-24 xl:table-cell">Created</TableHead>
              <TableHead variant="dashboard" className="px-0" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {environments.map((environment) => (
              <EnvironmentTableRow
                key={environment.environment_id}
                environment={environment}
                uniqueDataBlobs={uniqueDataBlobs}
                dataBlobsById={dataBlobsById}
                bindSelectionByEnvironment={bindSelectionByEnvironment}
                isShared={environment.access === "shared" || Boolean(sharedByMeResourceIds?.has(environment.environment_id))}
                configOpen={configEditorEnvironmentId === environment.environment_id}
                onBindSelectionChange={onBindSelectionChange}
                onBindSelectedData={onBindSelectedData}
                onUnbindData={onUnbindData}
                {...rowProps}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}
