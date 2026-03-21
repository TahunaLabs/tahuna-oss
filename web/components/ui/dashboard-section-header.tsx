import type * as React from "react"

import { cn } from "@/lib/utils"

type DashboardSectionHeaderProps = React.ComponentProps<"header"> & {
  title: string
  icon?: React.ReactNode
  count?: number
  rightContent?: React.ReactNode
}

function DashboardSectionHeader({
  title,
  icon,
  count,
  rightContent,
  className,
  ...props
}: DashboardSectionHeaderProps) {
  return (
    <header
      className={cn("flex items-center justify-between gap-3 pb-4", className)}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-2">
        {icon ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-foreground [&_svg]:h-6 [&_svg]:w-6">
            {icon}
          </span>
        ) : null}
        <h1 className="m-0 truncate font-sans text-dashboard-title font-dashboard-title tracking-tight text-foreground">
          {title}
        </h1>
        {count !== undefined ? <span className="text-sm text-muted-foreground">{count}</span> : null}
      </div>
      {rightContent ? <div className="shrink-0 text-dashboard-control text-muted-foreground">{rightContent}</div> : null}
    </header>
  )
}

export { DashboardSectionHeader }
