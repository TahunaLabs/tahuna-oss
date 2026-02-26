import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center font-mono uppercase", {
  variants: {
    variant: {
      default:
        "text-[10px] tracking-wider text-muted-foreground border border-border rounded px-2 py-0.5",
      filled:
        "text-xs tracking-widest text-foreground bg-secondary px-2 py-1",
      ghost: "text-xs tracking-widest text-muted-foreground",
      status:
        "bg-muted px-3 py-1 rounded text-xs text-muted-foreground",
    },
  },
  defaultVariants: { variant: "default" },
})

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
