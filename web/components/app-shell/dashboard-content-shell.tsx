import type * as React from "react"

import { cn } from "@/lib/utils"

function DashboardContentShell({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "box-border flex w-full min-h-0 flex-col items-stretch justify-start px-4 pb-10 pt-4 lg:px-8 lg:pt-6",
        className,
      )}
      {...props}
    />
  )
}

export { DashboardContentShell }
