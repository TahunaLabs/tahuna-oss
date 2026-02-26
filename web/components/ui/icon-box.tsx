import * as React from "react"

import { cn } from "@/lib/utils"

function IconBox({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="icon-box"
      className={cn("p-2 bg-secondary rounded-md", className)}
      {...props}
    />
  )
}

export { IconBox }
