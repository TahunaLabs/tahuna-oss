"use client"

import { Download, ExternalLink, Lock, Pencil, Share2, Unlock, X } from "lucide-react"

import {
  formatBytes,
  MAX_ARTIFACT_NAME_CHARS,
  type StorageItem,
} from "@/components/features/dashboard-model"
import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import { TableActionsCell } from "@/components/features/dashboard/table-actions-cell"
import { TableSelectCell } from "@/components/features/dashboard/table-select-cell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableCell, TableRow } from "@/components/ui/table"
import { TruncatedTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type StorageTableRowProps = {
  item: StorageItem
  renamingStorageId: string | null
  artifactRenameDraft: string
  artifactRenameBusyId: string | null
  onArtifactRenameDraftChange: (value: string) => void
  onSaveRenameArtifact: (item: StorageItem) => void
  onCancelRenameArtifact: () => void
  onStartRenameArtifact: (item: StorageItem) => void
  onShareStorageItem?: (item: StorageItem) => void
  onSetVisibility?: (item: StorageItem, visibility: "shared" | "private") => void
  selected: boolean
  onToggleSelected: (itemId: string) => void
}

function StorageTableRow({
  item,
  renamingStorageId,
  artifactRenameDraft,
  artifactRenameBusyId,
  onArtifactRenameDraftChange,
  onSaveRenameArtifact,
  onCancelRenameArtifact,
  onStartRenameArtifact,
  onShareStorageItem,
  onSetVisibility,
  selected,
  onToggleSelected,
}: StorageTableRowProps) {
  const isRenaming = renamingStorageId === item.id
  const isBusy = artifactRenameBusyId === item.id

  return (
    <TableRow
      className={cn(
        "group hover:bg-muted",
        selected ? "bg-secondary-faint" : "",
      )}
    >
      <TableSelectCell
        checked={selected}
        ariaLabel={`Select storage item ${item.name}`}
        onCheckedChange={() => onToggleSelected(item.id)}
      />

      <TableCell>
        {isRenaming ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => { e.preventDefault(); onSaveRenameArtifact(item) }}
          >
            <Input
              type="text"
              value={artifactRenameDraft}
              onChange={(e) => onArtifactRenameDraftChange(e.target.value)}
              disabled={isBusy}
              maxLength={MAX_ARTIFACT_NAME_CHARS}
              className="h-7 w-40 bg-muted px-2 text-xs"
            />
            <Button type="submit" variant="compact-toggle" size="compact-xs" disabled={isBusy}>
              {isBusy ? "..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={isBusy}
              onClick={onCancelRenameArtifact}
            >
              <X className="h-3 w-3" />
            </Button>
          </form>
        ) : (
          <TruncatedTooltip className="text-foreground">{item.name}</TruncatedTooltip>
        )}
      </TableCell>

      <TableCell className="text-muted-foreground">
        <p className="truncate">{item.visibility === "shared" ? "Shared" : "Private"}</p>
      </TableCell>

      <TableCell className="text-muted-foreground">
        {formatBytes(item.size)}
      </TableCell>

      <TableCell className="text-muted-foreground">
        {new Date(item.created_at).toLocaleDateString()}
      </TableCell>

      <TableCell className="text-muted-foreground">
        {item.source === "data" ? "Data upload" : "Run artifact"}
      </TableCell>

      <TableActionsCell>
        {!isRenaming ? (
          <ActionsMenu triggerLabel={`Open actions for ${item.name}`}>
            {(close) => (
              <>
                <Button asChild type="button" variant="sidebar-menu-item" size="none">
                  <a href={item.download_url} target="_blank" rel="noreferrer" onClick={() => close()}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </a>
                </Button>
                <Button asChild type="button" variant="sidebar-menu-item" size="none">
                  <a href={item.download_url} download={item.name} onClick={() => close()}>
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </Button>
                {item.source === "run_artifact" ? (
                  <Button
                    type="button"
                    variant="sidebar-menu-item"
                    size="none"
                    onClick={() => { close(); onStartRenameArtifact(item) }}
                    disabled={artifactRenameBusyId !== null}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </Button>
                ) : null}
                {item.source === "data" && onShareStorageItem ? (
                  <Button
                    type="button"
                    variant="sidebar-menu-item"
                    size="none"
                    onClick={() => { close(); onShareStorageItem(item) }}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Share
                  </Button>
                ) : null}
                {onSetVisibility ? (
                  <Button
                    type="button"
                    variant="sidebar-menu-item"
                    size="none"
                    onClick={() => {
                      close()
                      onSetVisibility(item, item.visibility === "shared" ? "private" : "shared")
                    }}
                  >
                    {item.visibility === "shared" ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Unlock className="h-3.5 w-3.5" />
                    )}
                    {item.visibility === "shared" ? "Make private" : "Make shared"}
                  </Button>
                ) : null}
              </>
            )}
          </ActionsMenu>
        ) : null}
      </TableActionsCell>
    </TableRow>
  )
}

export { StorageTableRow }
