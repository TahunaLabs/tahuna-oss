"use client"

import { MoreHorizontal } from "lucide-react"
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ActionsMenuProps = {
  triggerLabel: string
  align?: "left" | "right"
  menuClassName?: string
  triggerVariant?: ComponentProps<typeof Button>["variant"]
  children: (close: () => void) => ReactNode
}

export function ActionsMenu({
  triggerLabel,
  align = "right",
  menuClassName,
  triggerVariant = "dashboard-outline-icon-muted",
  children,
}: ActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!containerRef.current || !target) return
      if (!containerRef.current.contains(target)) {
        setOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <Button
        type="button"
        variant={triggerVariant}
        size="none"
        onClick={() => setOpen((current) => !current)}
        aria-label={triggerLabel}
      >
        <MoreHorizontal className="w-4 h-4" />
      </Button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 z-50 min-w-40 rounded-lg border border-border bg-popover py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
