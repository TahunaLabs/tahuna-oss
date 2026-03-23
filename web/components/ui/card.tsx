import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const cardVariants = cva("overflow-hidden", {
  variants: {
    variant: {
      default: "bg-card border border-border rounded-lg",
      elevated:
        "bg-card/80 backdrop-blur-sm border border-border rounded-xl",
      dashboard: "rounded-lg border border-border bg-card text-foreground",
      "dashboard-surface": "rounded-lg border border-border bg-background text-foreground",
      "dashboard-panel": "rounded-xl border border-border bg-background/80 text-foreground",
    },
  },
  defaultVariants: { variant: "default" },
})

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  )
}

function CardContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("p-5", className)}
      {...props}
    />
  )
}

export {
    Card, CardContent, cardVariants
}
