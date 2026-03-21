import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const statusDotVariants = cva("rounded-full", {
  variants: {
    variant: {
      success: "bg-green-400",
      muted: "bg-muted-foreground/30",
      queued: "bg-status-queued",
      provisioning: "bg-status-provisioning",
      running: "bg-status-running",
      completed: "bg-status-running",
      failed: "bg-status-failed",
      cancelled: "bg-muted-foreground",
      cancelling: "bg-status-cancelling",
    },
    size: {
      xs: "h-1.5 w-1.5",
      sm: "h-2 w-2",
      md: "h-2.5 w-2.5",
      lg: "h-3 w-3",
    },
  },
  defaultVariants: { variant: "muted", size: "sm" },
})

function StatusDot({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof statusDotVariants>) {
  return (
    <div
      data-slot="status-dot"
      className={cn(statusDotVariants({ variant, size, className }))}
      {...props}
    />
  )
}

type StatusDotVariant = VariantProps<typeof statusDotVariants>["variant"]

export { StatusDot, statusDotVariants, type StatusDotVariant }
