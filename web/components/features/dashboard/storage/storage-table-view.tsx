"use client"

import { useState } from "react"

import {
  type StorageItem,
} from "@/components/features/dashboard-model"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import { StorageTableRow } from "@/components/features/dashboard/storage/storage-table-row"
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
  onSetVisibility?: (item: StorageItem, visibility: "shared" | "private") => void
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
  onSetVisibility,
}: StorageTableViewProps) {
  const [selectedStorageIds, setSelectedStorageIds] = useState<Set<string>>(() => new Set())

  function toggleSelected(storageId: string) {
    setSelectedStorageIds((previous) => {
      const next = new Set(previous)
      if (next.has(storageId)) next.delete(storageId)
      else next.add(storageId)
      return next
    })
  }

  return (
    <DashboardTable
      columns={[
        { role: "select" },
        { role: "main" },
        { role: "meta" },
        { role: "meta" },
        { role: "meta" },
        { role: "meta" },
        { role: "actions" },
      ]}
      headerCells={(
        <>
          <TableHead className="px-1" />
          <TableHead>Name</TableHead>
          <TableHead>Access</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Source</TableHead>
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
          onSetVisibility={onSetVisibility}
          selected={selectedStorageIds.has(item.id)}
          onToggleSelected={toggleSelected}
        />
      ))}
    </DashboardTable>
  )
}

export { StorageTableView }
export type { StorageTableViewProps }
