import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const noticeVariants = cva("rounded-md border px-3 py-2 text-sm", {
  variants: {
    variant: {
      default: "border-border bg-muted/40 text-foreground",
      error: "border-destructive/30 bg-destructive/10 text-destructive",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function Notice({
  className,
  variant,
  ...props
}: React.ComponentProps<"p"> & VariantProps<typeof noticeVariants>) {
  return (
    <p
      data-slot="notice"
      className={cn(noticeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Notice, noticeVariants }
