import type * as React from "react"

import { cn } from "@/lib/utils"

function DashboardViewSwitcher({ className, ...props }: React.ComponentProps<"fieldset">) {
  return (
    <fieldset
      data-slot="dashboard-view-switcher"
      className={cn("flex items-center gap-1 rounded-md border border-border bg-secondary/50 p-0.5", className)}
      {...props}
    />
  )
}

export { DashboardViewSwitcher }
