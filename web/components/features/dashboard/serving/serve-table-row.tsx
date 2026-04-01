"use client"

import { relativeTime, type ServeRow } from "@/components/features/dashboard-model"
import {
  formatServeDevice,
  formatServeSource,
  formatServeStatus,
  serveStatusDotVariant,
} from "@/components/features/dashboard/serving/serve-presentation"
import { StatusDot } from "@/components/ui/status-dot"
import { TableCell, TableRow } from "@/components/ui/table"
import { TruncatedTooltip } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type ServeTableRowProps = {
  serve: ServeRow
  environmentLabel: string
  selected: boolean
  onSelectServe: (id: string | null) => void
}

function ServeTableRow({
  serve,
  environmentLabel,
  selected,
  onSelectServe,
}: ServeTableRowProps) {
  return (
    <TableRow
      className={cn(
        "group cursor-pointer align-middle hover:bg-muted",
        selected ? "bg-secondary-faint" : "",
      )}
      onClick={() => onSelectServe(selected ? null : serve.serve_id)}
    >
      <TableCell className="text-foreground">
        <TruncatedTooltip>{environmentLabel}</TruncatedTooltip>
      </TableCell>

      <TableCell className="text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <StatusDot variant={serveStatusDotVariant(serve.status)} size="sm" />
          {formatServeStatus(serve.status)}
        </span>
      </TableCell>

      <TableCell className="text-muted-foreground">
        <TruncatedTooltip tooltip={formatServeSource(serve.model_snapshot)}>
          {formatServeSource(serve.model_snapshot)}
        </TruncatedTooltip>
      </TableCell>

      <TableCell className="text-muted-foreground">
        <TruncatedTooltip tooltip={formatServeDevice(serve)}>
          {formatServeDevice(serve)}
        </TruncatedTooltip>
      </TableCell>

      <TableCell className="text-muted-foreground">
        {serve.created_at > 0 ? relativeTime(serve.created_at) : "—"}
      </TableCell>
    </TableRow>
  )
}

export { ServeTableRow }
