"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/status-dot"
import { TableActionsCell } from "@/components/features/dashboard/table-actions-cell"
import { TableSelectCell } from "@/components/features/dashboard/table-select-cell"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/utils"
import type { ApiKeyRow } from "@/components/features/dashboard-settings-model"
import type { Id } from "@convex/_generated/dataModel"
import { cn } from "@/lib/utils"

type MachinesTableRowProps = {
  apiKey: ApiKeyRow
  revokingId: Id<"apiKeys"> | null
  selected: boolean
  onToggleSelected: (id: Id<"apiKeys">) => void
  onRevoke: (id: Id<"apiKeys">, name: string) => void
}

function MachinesTableRow({
  apiKey,
  revokingId,
  selected,
  onToggleSelected,
  onRevoke,
}: MachinesTableRowProps) {
  const isActive = apiKey.status === "active"
  const isBusy = revokingId === apiKey._id

  return (
    <TableRow
      className={cn(
        "group hover:bg-muted",
        selected ? "bg-secondary-faint" : "",
      )}
    >
      <TableSelectCell
        checked={selected}
        ariaLabel={`Select machine ${apiKey.name}`}
        onCheckedChange={() => onToggleSelected(apiKey._id)}
      />

      <TableCell className="font-medium">
        {apiKey.name}
      </TableCell>

      <TableCell className="text-muted-foreground">
        {apiKey.machineId || "Unknown machine"}
      </TableCell>

      <TableCell className="font-mono text-xs text-muted-foreground">
        {apiKey.keyPrefix}
      </TableCell>

      <TableCell className="text-muted-foreground">
        {formatDate(apiKey._creationTime)}
      </TableCell>

      <TableCell className="text-muted-foreground">
        {formatDate(apiKey.lastUsedAt)}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2 text-sm capitalize">
          <StatusDot variant={isActive ? "success" : "muted"} size="xs" />
          <span>{apiKey.status}</span>
        </div>
      </TableCell>

      <TableActionsCell>
        {isActive ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="control"
                disabled={isBusy}
              >
                Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke machine session?</AlertDialogTitle>
                <AlertDialogDescription>
                  Session <code>{apiKey.name}</code> ({apiKey.machineId || "unknown machine"}) will lose API access immediately and must run <code>tahuna login</code> again.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep session</AlertDialogCancel>
                <AlertDialogAction onClick={() => onRevoke(apiKey._id, apiKey.name)} disabled={isBusy}>
                  {isBusy ? "Revoking..." : "Revoke session"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableActionsCell>
    </TableRow>
  )
}

export { MachinesTableRow }
