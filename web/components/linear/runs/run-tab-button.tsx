"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type RunTabButtonProps = {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}

function RunTabButton({
  label,
  active,
  onClick,
  count,
}: RunTabButtonProps) {
  return (
    <Button
      type="button"
      variant="dashboard-tab-compact"
      size="none"
      className={cn("text-[15px]", active ? "text-foreground" : "text-muted-foreground")}
      onClick={onClick}
    >
      {label}
      <ChevronDown className="h-3.5 w-3.5" />
      {count !== undefined && count > 0 ? (
        <span className="text-[var(--dashboard-control-font-size-small)] leading-[var(--dashboard-control-line-height-small)] text-muted-foreground">
          {count}
        </span>
      ) : null}
    </Button>
  )
}

export { RunTabButton }
