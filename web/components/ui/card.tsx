import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const cardVariants = cva("overflow-hidden rounded-lg text-foreground", {
  variants: {
    variant: {
      default: "border border-border bg-card",
      surface: "border border-border bg-background",
      panel: "border border-border bg-background/80",
      frame: "mt-2 ml-2 h-full border border-border bg-background shadow-xl",
      ghost: "bg-transparent",
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
