"use client"

import { MoreVertical } from "lucide-react"
import { useState, type ComponentProps, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type ActionsMenuProps = {
  triggerLabel: string
  align?: "left" | "right"
  menuClassName?: string
  triggerVariant?: ComponentProps<typeof Button>["variant"]
  triggerClassName?: string
  triggerContent?: ReactNode
  children: (close: () => void) => ReactNode
}

export function ActionsMenu({
  triggerLabel,
  align = "right",
  menuClassName,
  triggerVariant = "ghost",
  triggerClassName,
  triggerContent,
  children,
}: ActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const contentAlign = align === "left" ? "start" : "end"

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size="none"
          className={triggerClassName}
          aria-label={triggerLabel}
        >
          {triggerContent ?? <MoreVertical className="w-4 h-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={contentAlign}
        sideOffset={4}
        className={cn("min-w-40", menuClassName)}
      >
        {children(() => setOpen(false))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
