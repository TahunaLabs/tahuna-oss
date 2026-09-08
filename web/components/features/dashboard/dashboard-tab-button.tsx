"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"

type DashboardTabButtonProps = {
  label: string
  active: boolean
  onClick: () => void
  count?: number
}

function DashboardTabButton({ label, active, onClick, count }: DashboardTabButtonProps) {
  return (
    <Button
      type="button"
      variant="tab"
      data-active={active || undefined}
      size="none"
      className="text-ui-tab"
      onClick={onClick}
    >
      {label}
      <ChevronDown className="h-3.5 w-3.5" />
      {count !== undefined && count > 0 ? (
        <span className="text-xs text-muted-foreground">{count}</span>
      ) : null}
    </Button>
  )
}

export { DashboardTabButton }
