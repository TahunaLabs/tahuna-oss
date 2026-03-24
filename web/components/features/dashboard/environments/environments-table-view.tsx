"use client"

import { useState } from "react"

import {
  type DataBlobRow,
  type EnvironmentRow,
} from "@/components/features/dashboard-model"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import { EnvironmentTableRow } from "@/components/features/dashboard/environments/environment-table-row"
import type { EnvironmentsGridViewProps } from "@/components/features/dashboard/environments/environments-grid-view"
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
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<Set<EnvironmentRow["environment_id"]>>(
    () => new Set(),
  )
  const [deletingSelected, setDeletingSelected] = useState(false)
  const [prevEnvironments, setPrevEnvironments] = useState(environments)
  const visibleEnvironmentIds = environments.map((environment) => environment.environment_id)

  if (prevEnvironments !== environments) {
    setPrevEnvironments(environments)
    const visibleSet = new Set(visibleEnvironmentIds)
    setSelectedEnvironmentIds((previous) => {
      const next = new Set(Array.from(previous).filter((id) => visibleSet.has(id)))
      return next.size === previous.size ? previous : next
    })
  }

  const selectedVisibleCount = visibleEnvironmentIds.filter((id) => selectedEnvironmentIds.has(id)).length
  const allVisibleSelected = visibleEnvironmentIds.length > 0 && selectedVisibleCount === visibleEnvironmentIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  function toggleSelected(environmentId: EnvironmentRow["environment_id"]) {
    setSelectedEnvironmentIds((previous) => {
      const next = new Set(previous)
      if (next.has(environmentId)) next.delete(environmentId)
      else next.add(environmentId)
      return next
    })
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedEnvironmentIds(() => (
      checked ? new Set(visibleEnvironmentIds) : new Set()
    ))
  }

  async function deleteSelectedEnvironments() {
    const ids = visibleEnvironmentIds.filter((id) => selectedEnvironmentIds.has(id))
    if (ids.length === 0 || deletingSelected) return
    setDeletingSelected(true)
    try {
      const deleted = await rowProps.onDeleteEnvironments(ids)
      if (deleted) {
        setSelectedEnvironmentIds(new Set())
      }
    } finally {
      setDeletingSelected(false)
    }
  }

  return (
    <>
      <TableSelectionBar
        selectedCount={selectedVisibleCount}
        itemLabel="environment"
        onClearSelection={() => setSelectedEnvironmentIds(new Set())}
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
