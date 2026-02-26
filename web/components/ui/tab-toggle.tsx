"use client"

import { cn } from "@/lib/utils"
import * as React from "react"

/* ------------------------------------------------------------------ */
/*  TabToggle — rounded-full OS / option selector                      */
/* ------------------------------------------------------------------ */

type TabToggleOption<T extends string> = {
  value: T
  label: string
}

type TabToggleProps<T extends string> = {
  options: TabToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

function TabToggle<T extends string>({
  options,
  value,
  onChange,
  className,
}: TabToggleProps<T>) {
  return (
    <div
      data-slot="tab-toggle"
      className={cn(
        "inline-flex items-center gap-1 bg-card border border-border rounded-full overflow-hidden",
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "cursor-pointer text-xs font-mono px-4 py-2 transition-colors",
            value === option.value
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  CommandPill — the CLI command display next to the toggle            */
/*  Matches TabToggle height, font family & font size                  */
/* ------------------------------------------------------------------ */

function CommandPill({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-pill"
      className={cn(
        "inline-flex items-center gap-2 bg-card border border-border rounded-full px-4 py-2 text-xs font-mono text-foreground/80",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { CommandPill, TabToggle }
export type { TabToggleOption, TabToggleProps }

