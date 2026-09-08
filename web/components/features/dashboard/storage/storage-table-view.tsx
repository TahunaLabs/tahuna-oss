"use client"

import { useState } from "react"

import {
  type StorageItem,
} from "@/components/features/dashboard-model"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import { StorageTableRow } from "@/components/features/dashboard/storage/storage-table-row"
import { useTableSelection } from "@/components/features/dashboard/use-table-selection"
import { TableSelectHeadCell } from "@/components/features/dashboard/table-select-head-cell"
import { TableSelectionBar } from "@/components/features/dashboard/table-selection-bar"
import { TableHead } from "@/components/ui/table"

type StorageTableViewProps = {
  items: StorageItem[]
  total: number
  offset: number
  hasMore: boolean
  renamingStorageId: string | null
  artifactRenameDraft: string
  artifactRenameBusyId: string | null
  onArtifactRenameDraftChange: (value: string) => void
  onSaveRenameArtifact: (item: StorageItem) => void
  onCancelRenameArtifact: () => void
  onStartRenameArtifact: (item: StorageItem) => void
  onPreviousPage: () => void
  onNextPage: () => void
  onShareStorageItem?: (item: StorageItem) => void
  onDeleteStorageItems: (items: StorageItem[]) => Promise<boolean>
  onSetVisibility?: (item: StorageItem, visibility: "shared" | "private") => void
  deleteBusy: boolean
}

function StorageTableView({
  items,
  total,
  offset,
  hasMore,
  renamingStorageId,
  artifactRenameDraft,
  artifactRenameBusyId,
  onArtifactRenameDraftChange,
  onSaveRenameArtifact,
  onCancelRenameArtifact,
  onStartRenameArtifact,
  onPreviousPage,
  onNextPage,
  onShareStorageItem,
  onDeleteStorageItems,
  onSetVisibility,
  deleteBusy,
}: StorageTableViewProps) {
  const [deletingSelected, setDeletingSelected] = useState(false)
  const visibleStorageIds = items.map((item) => item.id)
  const {
    selectedIds: selectedStorageIds,
    selectedVisibleCount,
    allVisibleSelected,
    someVisibleSelected,
    toggleSelected,
    toggleSelectAllVisible,
    clearSelection,
  } = useTableSelection(visibleStorageIds)

  async function deleteSelectedStorageItems() {
    const selectedItems = items.filter((item) => selectedStorageIds.has(item.id))
    if (selectedItems.length === 0 || deleteBusy || deletingSelected) return
    setDeletingSelected(true)
    try {
      const deleted = await onDeleteStorageItems(selectedItems)
      if (deleted) clearSelection()
    } finally {
      setDeletingSelected(false)
    }
  }

  return (
    <>
      <TableSelectionBar
        selectedCount={selectedVisibleCount}
        itemLabel="storage item"
        onClearSelection={clearSelection}
        onDeleteSelected={() => { void deleteSelectedStorageItems() }}
        deleteBusy={deleteBusy || deletingSelected}
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
          { role: "meta" },
          { role: "actions" },
        ]}
        headerCells={(
          <>
            <TableSelectHeadCell
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              ariaLabel="Select all visible storage items"
              onCheckedChange={toggleSelectAllVisible}
            />
            <TableHead>Name</TableHead>
            <TableHead>Access</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Run</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead className="px-0" />
          </>
        )}
        pagination={{
          total,
          offset,
          count: items.length,
          hasPrevious: offset > 0,
          hasNext: hasMore,
          onPrevious: onPreviousPage,
          onNext: onNextPage,
        }}
      >
        {items.map((item) => (
          <StorageTableRow
            key={item.id}
            item={item}
            renamingStorageId={renamingStorageId}
            artifactRenameDraft={artifactRenameDraft}
            artifactRenameBusyId={artifactRenameBusyId}
            onArtifactRenameDraftChange={onArtifactRenameDraftChange}
            onSaveRenameArtifact={onSaveRenameArtifact}
            onCancelRenameArtifact={onCancelRenameArtifact}
            onStartRenameArtifact={onStartRenameArtifact}
            onShareStorageItem={onShareStorageItem}
            onDeleteStorageItem={(target) => { void onDeleteStorageItems([target]) }}
            deleteBusy={deleteBusy}
            onSetVisibility={onSetVisibility}
            selected={selectedStorageIds.has(item.id)}
            onToggleSelected={toggleSelected}
          />
        ))}
      </DashboardTable>
    </>
  )
}

export { StorageTableView }
export type { StorageTableViewProps }
