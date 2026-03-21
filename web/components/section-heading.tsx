import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const sectionHeadingVariants = cva("tracking-tight text-foreground", {
  variants: {
    variant: {
      default: "text-3xl md:text-4xl font-serif",
      display: "text-4xl md:text-5xl lg:text-6xl font-serif italic",
      hero: "font-serif text-5xl leading-display-tight md:text-7xl lg:text-display-hero",
      medium: "text-3xl md:text-4xl font-medium",
    },
  },
  defaultVariants: { variant: "default" },
})

function SectionHeading({
  className,
  variant,
  ...props
}: React.ComponentProps<"h2"> & VariantProps<typeof sectionHeadingVariants>) {
  return (
    <h2
      data-slot="section-heading"
      className={cn(sectionHeadingVariants({ variant, className }))}
      {...props}
    />
  )
}

export { SectionHeading, sectionHeadingVariants }
