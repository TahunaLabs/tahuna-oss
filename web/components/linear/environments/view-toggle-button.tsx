"use client"

import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"

type ViewToggleButtonProps = {
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}

function ViewToggleButton({
  label,
  active,
  onClick,
  icon,
}: ViewToggleButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "dashboard-view-toggle-active" : "dashboard-view-toggle"}
      size="none"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="sr-only">{label}</span>
      {icon}
    </Button>
  )
}

export { ViewToggleButton }
