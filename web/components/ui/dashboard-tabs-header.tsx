import type * as React from "react"

import { cn } from "@/lib/utils"

function DashboardTabsHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dashboard-tabs-header"
      className={cn(className)}
      {...props}
    />
  )
}

export { DashboardTabsHeader }
