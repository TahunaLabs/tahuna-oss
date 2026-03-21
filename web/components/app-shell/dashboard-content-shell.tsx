import type * as React from "react"

import { cn } from "@/lib/utils"

function DashboardContentShell({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "box-border flex w-full min-h-0 flex-col items-stretch justify-start px-4 pt-4 md:px-24 md:pt-24",
        className,
      )}
      {...props}
    />
  )
}

export { DashboardContentShell }
