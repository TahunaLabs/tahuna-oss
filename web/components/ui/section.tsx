import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Section                                                            */
/* ------------------------------------------------------------------ */

const sectionVariants = cva("px-6", {
  variants: {
    variant: {
      default: "py-20 md:py-28 border-t border-border",
      hero: "py-20 md:py-32",
      blurred: "py-24 md:py-32 bg-background/15 backdrop-blur-sm",
    },
  },
  defaultVariants: { variant: "default" },
})

function Section({
  className,
  variant,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof sectionVariants>) {
  return (
    <section
      data-slot="section"
      className={cn(sectionVariants({ variant, className }))}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  SectionContainer                                                   */
/* ------------------------------------------------------------------ */

const containerVariants = cva("mx-auto", {
  variants: {
    size: {
      default: "max-w-7xl",
      md: "max-w-4xl",
      sm: "max-w-xl",
      lg: "max-w-3xl",
    },
  },
  defaultVariants: { size: "default" },
})

function SectionContainer({
  className,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof containerVariants>) {
  return (
    <div
      data-slot="section-container"
      className={cn(containerVariants({ size, className }))}
      {...props}
    />
  )
}

export { containerVariants, Section, SectionContainer, sectionVariants }

