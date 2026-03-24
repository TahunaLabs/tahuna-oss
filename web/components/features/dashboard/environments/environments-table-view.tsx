"use client"

import { useState } from "react"

import {
  type DataBlobRow,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import { EnvironmentTableRow } from "@/components/features/dashboard/environments/environment-table-row"
import type { EnvironmentsGridViewProps } from "@/components/features/dashboard/environments/environments-grid-view"
import { useTableSelection } from "@/components/features/dashboard/use-table-selection"
import { TableSelectHeadCell } from "@/components/features/dashboard/table-select-head-cell"
import { TableSelectionBar } from "@/components/features/dashboard/table-selection-bar"
import { TableHead } from "@/components/ui/table"

type EnvironmentsTableViewProps = EnvironmentsGridViewProps & {
  uniqueDataBlobs: DataBlobRow[]
  bindSelectionByEnvironment: Record<string, string>
  onBindSelectionChange: (environmentId: string, value: string) => void
  onBindSelectedData: (environment: EnvironmentRow, dataId: string) => void
  onUnbindData: (environmentId: EnvironmentRow["environment_id"], dataId: string) => void
}

function EnvironmentsTableView({
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
}: EnvironmentsTableViewProps) {
  const [deletingSelected, setDeletingSelected] = useState(false)
  const visibleEnvironmentIds = environments.map((environment) => environment.environment_id)
  const {
    selectedIds: selectedEnvironmentIds,
    selectedVisibleCount,
    allVisibleSelected,
    someVisibleSelected,
    toggleSelected,
    toggleSelectAllVisible,
    clearSelection,
  } = useTableSelection(visibleEnvironmentIds)

  async function deleteSelectedEnvironments() {
    const ids = visibleEnvironmentIds.filter((id) => selectedEnvironmentIds.has(id))
    if (ids.length === 0 || deletingSelected) return
    setDeletingSelected(true)
    try {
      const deleted = await rowProps.onDeleteEnvironments(ids)
      if (deleted) clearSelection()
    } finally {
      setDeletingSelected(false)
    }
  }

  return (
    <>
      <TableSelectionBar
        selectedCount={selectedVisibleCount}
        itemLabel="environment"
        onClearSelection={clearSelection}
        onDeleteSelected={() => { void deleteSelectedEnvironments() }}
        deleteBusy={deletingSelected}
      />
      <DashboardTable
        columns={[
          { role: "select" },
          { role: "main" },
          { role: "meta" },
          { role: "meta" },
          { role: "meta" },
          { role: "meta" },
          { role: "meta" },
          { role: "meta", className: "hidden xl:table-column" },
          { role: "actions" },
        ]}
        headerCells={(
          <>
            <TableSelectHeadCell
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              ariaLabel="Select all visible environments"
              onCheckedChange={toggleSelectAllVisible}
            />
            <TableHead>Name</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Runtime</TableHead>
            <TableHead>Last updated</TableHead>
            <TableHead className="hidden xl:table-cell">Created</TableHead>
            <TableHead className="px-0" />
          </>
        )}
        pagination={{
          total: environments.length,
          offset: 0,
          count: environments.length,
          hasPrevious: false,
          hasNext: false,
        }}
      >
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
            selected={selectedEnvironmentIds.has(environment.environment_id)}
            onToggleSelected={toggleSelected}
            {...rowProps}
          />
        ))}
      </DashboardTable>
    </>
  )
}

export { EnvironmentsTableView }
export type { EnvironmentsTableViewProps }
