"use client"

import { type ApiKeyRow } from "@/components/features/dashboard-settings-model"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import { MachinesTableRow } from "@/components/features/dashboard/machines/machines-table-row"
import { useTableSelection } from "@/components/features/dashboard/use-table-selection"
import { TableSelectHeadCell } from "@/components/features/dashboard/table-select-head-cell"
import { TableSelectionBar } from "@/components/features/dashboard/table-selection-bar"
import { TableHead } from "@/components/ui/table"

type MachinesTableViewProps = {
  keys: ApiKeyRow[]
  revokingId: string | null
  onRevoke: (id: string, name: string) => void
}

function MachinesTableView({
  keys,
  revokingId,
  onRevoke,
}: MachinesTableViewProps) {
  const visibleKeyIds = keys.map((key) => key._id)
  const {
    selectedIds: selectedKeyIds,
    selectedVisibleCount,
    allVisibleSelected,
    someVisibleSelected,
    toggleSelected,
    toggleSelectAllVisible,
    clearSelection,
  } = useTableSelection(visibleKeyIds)

  return (
    <>
      <TableSelectionBar
        selectedCount={selectedVisibleCount}
        itemLabel="machine"
        onClearSelection={clearSelection}
        onDeleteSelected={clearSelection}
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
          { role: "actions" },
        ]}
        headerCells={(
          <>
            <TableSelectHeadCell
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              ariaLabel="Select all visible machines"
              onCheckedChange={toggleSelectAllVisible}
            />
            <TableHead>Name</TableHead>
            <TableHead>Machine</TableHead>
            <TableHead>Prefix</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Used</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="px-0" />
          </>
        )}
        pagination={{
          total: keys.length,
          offset: 0,
          count: keys.length,
          hasPrevious: false,
          hasNext: false,
        }}
      >
        {keys.map((apiKey) => (
          <MachinesTableRow
            key={apiKey._id}
            apiKey={apiKey}
            revokingId={revokingId}
            selected={selectedKeyIds.has(apiKey._id)}
            onToggleSelected={toggleSelected}
            onRevoke={onRevoke}
          />
        ))}
      </DashboardTable>
    </>
  )
}

export { MachinesTableView }
export type { MachinesTableViewProps }
