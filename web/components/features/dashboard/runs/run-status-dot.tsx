"use client"

import { cn } from "@/lib/utils"

const STATUS_DOT_CLASS: Record<string, string> = {
  queued: "bg-status-queued",
  provisioning: "bg-status-provisioning",
  running: "bg-status-running",
  completed: "bg-status-running",
  failed: "bg-status-failed",
  cancelled: "bg-muted-foreground",
  cancelling: "bg-status-cancelling",
}

type RunStatusDotProps = {
  status: string
  size?: "sm" | "md"
}

function RunStatusDot({ status, size = "sm" }: RunStatusDotProps) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full",
        size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5",
        STATUS_DOT_CLASS[status] ?? "bg-muted-foreground",
      )}
    />
  )
}

export { RunStatusDot, STATUS_DOT_CLASS }
