"use client"

import { Download, ExternalLink, Pencil, Share2, X } from "lucide-react"

import {
  formatBytes,
  MAX_ARTIFACT_NAME_CHARS,
  type StorageItem,
} from "@/components/features/dashboard-model"
import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { TableCell, TableRow } from "@/components/ui/table"

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
}: StorageTableRowProps) {
  const isRenaming = renamingStorageId === item.id
  const isBusy = artifactRenameBusyId === item.id

  return (
    <TableRow className="group hover:bg-muted">
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
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-foreground">{item.name}</p>
            <div className="shrink-0">
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
                  </>
                )}
              </ActionsMenu>
            </div>
          </div>
        )}
      </TableCell>

      <TableCell>
        <Button
          type="button"
          variant="compact-toggle"
          data-active={item.visibility === "shared" || undefined}
          size="compact-xs"
          onClick={() => onSetVisibility?.(item, item.visibility === "shared" ? "private" : "shared")}
          disabled={!onSetVisibility}
        >
          {item.visibility === "shared" ? "Shared" : "Private"}
        </Button>
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
    </TableRow>
  )
}

export { StorageTableRow }
