"use client"

import { Users } from "lucide-react"

import { relativeTime, type RunRow } from "@/components/features/dashboard-model"
import { RunActionsMenu } from "@/components/features/dashboard/runs/run-actions-menu"
import { TableActionsCell } from "@/components/features/dashboard/table-actions-cell"
import { StatusDot, toStatusDotVariant } from "@/components/ui/status-dot"
import { TableCell, TableRow } from "@/components/ui/table"
import { TruncatedTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type RunTableRowProps = {
  run: RunRow
  environmentLabel: string
  selected: boolean
  busy: boolean
  sharedByMeResourceIds?: ReadonlySet<string>
  onSelectRun: (id: string | null) => void
  onCancelRun: (id: RunRow["run_id"]) => void
  onDeleteRuns: (ids: RunRow["run_id"][]) => Promise<void>
  onShareRun?: (id: string) => void
}

function formatRunUptime(uptimeMs: number) {
  if (!Number.isFinite(uptimeMs) || uptimeMs <= 0) return "—"
  const totalSeconds = Math.floor(uptimeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

function RunTableRow({
  run,
  environmentLabel,
  selected,
  busy,
  sharedByMeResourceIds,
  onSelectRun,
  onCancelRun,
  onDeleteRuns,
  onShareRun,
}: RunTableRowProps) {
  const runLabel = run.name || "Untitled run"

  return (
    <TableRow
      className={cn(
        "group cursor-pointer align-middle hover:bg-muted",
        selected ? "bg-secondary-faint" : "",
      )}
      onClick={() => onSelectRun(selected ? null : run.run_id)}
    >
      <TableCell className="text-foreground">
        <div className="flex min-w-0 items-center gap-2">
          <TruncatedTooltip>{runLabel}</TruncatedTooltip>
          {sharedByMeResourceIds?.has(run.run_id) ? (
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : null}
        </div>
      </TableCell>

      <TableCell className="text-muted-foreground">
        <span className="inline-flex items-center gap-2 capitalize">
          <StatusDot variant={toStatusDotVariant(run.status)} size="sm" />
          {run.status}
        </span>
      </TableCell>

      <TableCell className="text-muted-foreground">
        <TruncatedTooltip>{environmentLabel}</TruncatedTooltip>
      </TableCell>

      <TableCell className="text-muted-foreground">
        {run.created_at > 0 ? relativeTime(run.created_at) : "—"}
      </TableCell>

      <TableCell className="text-muted-foreground">
        {formatRunUptime(run.uptime_ms)}
      </TableCell>

      <TableActionsCell stopRowClick>
        <RunActionsMenu
          run={run}
          busy={busy}
          onSelectRun={onSelectRun}
          onCancelRun={onCancelRun}
          onDeleteRuns={onDeleteRuns}
          onShareRun={onShareRun}
        />
      </TableActionsCell>
    </TableRow>
  )
}

export { RunTableRow, formatRunUptime }
