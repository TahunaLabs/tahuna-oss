"use client"

import {
  Server,
  Users,
  Search,
  ChevronDown,
  Folder,
  Grid2x2,
  List,
} from "lucide-react"
import { Fragment, useMemo, useState } from "react"

import { DashboardViewLayout } from "@/components/app-shell/layout-shell"
import {
  type DataBlobRow,
  type EnvironmentRow,
  relativeTime,
} from "@/components/features/dashboard-model"
import { EnvironmentActionsMenu } from "@/components/features/dashboard/environments/environment-actions-menu"
import { EnvironmentBindingCell } from "@/components/features/dashboard/environments/environment-binding-cell"
import { EnvironmentConfigPanel } from "@/components/features/dashboard/environments/environment-config-panel"
import { EnvironmentsEmptyState } from "@/components/features/dashboard/environments/environments-empty-state"
import { FilterDropdown, type FilterDropdownOption } from "@/components/features/dashboard/environments/filter-dropdown"
import { GridBoundDataPreview } from "@/components/features/dashboard/environments/grid-bound-data-preview"
import { ViewToggleButton } from "@/components/features/dashboard/environments/view-toggle-button"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DashboardViewSwitcher } from "@/components/ui/dashboard-view-switcher"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatGpuLabel(gpuType: string) {
  const trimmed = gpuType
    .replace(/^nvidia\s+geforce\s+/i, "")
    .replace(/^nvidia\s+/i, "")
    .replace(/^amd\s+radeon\s+/i, "")
    .replace(/^amd\s+/i, "")
    .replace(/^intel\s+/i, "")
    .trim()
  return trimmed || gpuType
}

function deviceLabel(environment: Pick<EnvironmentRow, "gpu_type" | "gpu_count" | "volume_gb">) {
  return `${formatGpuLabel(environment.gpu_type)} x${environment.gpu_count} · ${environment.volume_gb}GB`
}

type EnvironmentsViewProps = {
  creditsLabel: string
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
  creditsLabel,
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
      ...Array.from(options)
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({ value, label: value })),
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
        .sort((left, right) => left.localeCompare(right))
        .map((value) => ({ value, label: formatGpuLabel(value) })),
    ]
  }, [environments])

  const visibleEnvironments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return environments.filter((environment) => {
      const runtimeLabel = `${environment.framework}:${environment.version}`
      const searchTarget = [
        environment.name,
        runtimeLabel,
        environment.gpu_type,
        environment.access,
      ]
        .join(" ")
        .toLowerCase()
      if (query && !searchTarget.includes(query)) {
        return false
      }
      if (accessFilter !== "all" && environment.access !== accessFilter) {
        return false
      }
      if (runtimeFilter !== "all" && runtimeLabel !== runtimeFilter) {
        return false
      }
      if (deviceFilter !== "all" && environment.gpu_type !== deviceFilter) {
        return false
      }
      return true
    })
  }, [accessFilter, deviceFilter, environments, runtimeFilter, searchQuery])

  const renderEnvironmentCards = (gridClassName: string) => (
    <div className={gridClassName}>
      {visibleEnvironments.map((environment) => {
        const configOpen = configEditorEnvironmentId === environment.environment_id
        const isShared =
          environment.access === "shared" ||
          sharedByMeResourceIds?.has(environment.environment_id)

        return (
          <Card key={environment.environment_id} variant="dashboard-surface" className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm text-foreground">{environment.name}</p>
                  {isShared ? (
                    <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {environment.framework}:{environment.version}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {deviceLabel(environment)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {isShared ? "Shared" : "Private"} · Updated {relativeTime(environment.last_updated_at)}
                </p>
              </div>

              <EnvironmentActionsMenu
                environment={environment}
                busy={busy}
                configOpen={configOpen}
                configSaving={configSaving}
                onCloseConfigEditor={onCloseConfigEditor}
                onDeleteEnvironments={onDeleteEnvironments}
                onLaunchRun={onLaunchRun}
                onOpenConfigEditor={onOpenConfigEditor}
                onShareEnvironment={onShareEnvironment}
              />
            </div>

            <GridBoundDataPreview
              environment={environment}
              dataBlobsById={dataBlobsById}
            />

            {configOpen ? (
              <div className="mt-4">
                <EnvironmentConfigPanel
                  environmentId={environment.environment_id}
                  configName={configName}
                  configDraft={configDraft}
                  configSourceText={configSourceText}
                  configError={configError}
                  configLoading={configLoading}
                  configSaving={configSaving}
                  onClose={onCloseConfigEditor}
                  onDraftChange={onConfigDraftChange}
                  onCancel={onCancelConfigEdit}
                  onSave={onSaveConfig}
                />
              </div>
            ) : null}
          </Card>
        )
      })}
    </div>
  )

  return (
    <DashboardViewLayout
      sectionLabel="Environments"
      title="Environments"
      titleIcon={<Server size={24} />}
      creditsLabel={creditsLabel}
      rightContent={null}
      toolbar={(
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
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search"
                className="w-full"
              />
            </div>
            <FilterDropdown
              ariaLabel="Access filter"
              value={accessFilter}
              options={accessFilterOptions}
              onSelect={(value) => setAccessFilter(value as "all" | "private" | "shared")}
            />
            <FilterDropdown
              ariaLabel="Runtime filter"
              value={runtimeFilter}
              options={runtimeFilterOptions}
              onSelect={setRuntimeFilter}
            />
            <FilterDropdown
              ariaLabel="Device filter"
              value={deviceFilter}
              options={deviceFilterOptions}
              onSelect={setDeviceFilter}
            />
          </div>

          <div className="flex w-full items-center gap-2 md:w-auto md:shrink-0">
            <Button type="button" variant="dashboard-folder-filter" size="none" className="flex-1 md:flex-none">
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
                  onClick={() => setViewMode("grid")}
                  icon={<Grid2x2 className="h-4 w-4" />}
                />
                <ViewToggleButton
                  label="Table view"
                  active={viewMode === "table"}
                  onClick={() => setViewMode("table")}
                  icon={<List className="h-4 w-4" />}
                />
              </DashboardViewSwitcher>
            </div>
          </div>
        </div>
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
            {renderEnvironmentCards("grid grid-cols-1 gap-3")}
          </div>
          <div className="hidden md:block">
            {viewMode === "grid" ? (
              renderEnvironmentCards("grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3")
            ) : (
              <Card variant="dashboard-surface" className="flex min-h-0 flex-1 overflow-hidden">
                <div className="min-w-0 flex-1 overflow-auto">
                  <Table variant="dashboard" className="w-full table-fixed">
                    <TableHeader variant="dashboard" className="sticky top-0 bg-background">
                      <TableRow variant="dashboard-head" className="text-left">
                        <TableHead variant="dashboard" className="w-9 px-0" />
                        <TableHead variant="dashboard" className="w-[22%] min-w-[140px]">Name</TableHead>
                        <TableHead variant="dashboard" className="hidden w-[10%] min-w-[90px] lg:table-cell">Access</TableHead>
                        <TableHead variant="dashboard" className="w-[24%] min-w-[180px]">Data</TableHead>
                        <TableHead variant="dashboard" className="w-[18%] min-w-[140px]">Device</TableHead>
                        <TableHead variant="dashboard" className="w-[16%] min-w-[120px]">Runtime</TableHead>
                        <TableHead variant="dashboard" className="w-[10%] min-w-[95px]">Last updated</TableHead>
                        <TableHead variant="dashboard" className="hidden w-[10%] min-w-[95px] xl:table-cell">Created</TableHead>
                        <TableHead variant="dashboard" className="w-[75px] px-0" />
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {visibleEnvironments.map((environment) => {
                        const configOpen = configEditorEnvironmentId === environment.environment_id
                        const isShared =
                          environment.access === "shared" ||
                          sharedByMeResourceIds?.has(environment.environment_id)

                        return (
                          <Fragment key={environment.environment_id}>
                            <TableRow variant="dashboard" className="group align-middle hover:bg-secondary/50">
                              <TableCell variant="dashboard" className="px-0" />

                              <TableCell variant="dashboard" className="text-foreground">
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <p className="truncate">{environment.name}</p>
                                    {isShared ? (
                                      <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    ) : null}
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell variant="dashboard" className="hidden text-muted-foreground lg:table-cell">
                                <p className="truncate">{isShared ? "Shared" : "Private"}</p>
                              </TableCell>

                              <TableCell variant="dashboard" className="overflow-hidden pl-3 pr-1">
                                <EnvironmentBindingCell
                                  environment={environment}
                                  uniqueDataBlobs={uniqueDataBlobs}
                                  dataBlobsById={dataBlobsById}
                                  bindSelectionByEnvironment={bindSelectionByEnvironment}
                                  busy={busy}
                                  onBindSelectionChange={onBindSelectionChange}
                                  onBindSelectedData={onBindSelectedData}
                                  onUnbindData={onUnbindData}
                                />
                              </TableCell>

                              <TableCell variant="dashboard" className="text-muted-foreground">
                                <p
                                  className="truncate"
                                  title={`${environment.gpu_type} x${environment.gpu_count} · ${environment.volume_gb}GB`}
                                >
                                  {deviceLabel(environment)}
                                </p>
                              </TableCell>

                              <TableCell variant="dashboard" className="text-muted-foreground">
                                <p className="truncate" title={`${environment.framework}:${environment.version}`}>
                                  {environment.framework}:{environment.version}
                                </p>
                              </TableCell>

                              <TableCell variant="dashboard" className="text-muted-foreground">
                                <p className="truncate">{relativeTime(environment.last_updated_at)}</p>
                              </TableCell>

                              <TableCell variant="dashboard" className="hidden text-muted-foreground xl:table-cell">
                                <p className="truncate">{relativeTime(environment.created_at)}</p>
                              </TableCell>

                              <TableCell variant="dashboard" className="px-0 align-middle">
                                <div className="flex items-center justify-center">
                                  <EnvironmentActionsMenu
                                    environment={environment}
                                    busy={busy}
                                    configOpen={configOpen}
                                    configSaving={configSaving}
                                    onCloseConfigEditor={onCloseConfigEditor}
                                    onDeleteEnvironments={onDeleteEnvironments}
                                    onLaunchRun={onLaunchRun}
                                    onOpenConfigEditor={onOpenConfigEditor}
                                    onShareEnvironment={onShareEnvironment}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>

                            {configOpen ? (
                              <TableRow variant="dashboard" className="bg-secondary/20">
                                <TableCell colSpan={9} className="px-6 pb-4 pt-1">
                                  <EnvironmentConfigPanel
                                    environmentId={environment.environment_id}
                                    configName={configName}
                                    configDraft={configDraft}
                                    configSourceText={configSourceText}
                                    configError={configError}
                                    configLoading={configLoading}
                                    configSaving={configSaving}
                                    onClose={onCloseConfigEditor}
                                    onDraftChange={onConfigDraftChange}
                                    onCancel={onCancelConfigEdit}
                                    onSave={onSaveConfig}
                                  />
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </DashboardViewLayout>
  )
}
