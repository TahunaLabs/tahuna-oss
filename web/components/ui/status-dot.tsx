import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const statusDotVariants = cva("rounded-full", {
  variants: {
    variant: {
      success: "bg-green-400",
      muted: "bg-muted-foreground/30",
    },
    size: {
      sm: "w-1.5 h-1.5",
      md: "w-3 h-3",
    },
  },
  defaultVariants: { variant: "muted", size: "md" },
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

export { StatusDot, statusDotVariants }
