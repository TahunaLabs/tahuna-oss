import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

const cardVariants = cva("overflow-hidden", {
  variants: {
    variant: {
      default: "bg-card border border-border rounded-lg",
      elevated:
        "bg-card/80 backdrop-blur-sm border border-border rounded-xl",
      pill: "bg-card border border-border rounded-full",
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

/* ------------------------------------------------------------------ */
/*  CardHeader  — the "traffic-light" title bar from the terminal      */
/* ------------------------------------------------------------------ */

function CardHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "flex items-center gap-2 px-4 py-3 border-b border-border",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  CardDots  — the three macOS-style window dots                       */
/* ------------------------------------------------------------------ */

function CardDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-1.5", className)}>
      <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
      <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
      <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  CardTitle  — small mono title used in the header                    */
/* ------------------------------------------------------------------ */

function CardTitle({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="card-title"
      className={cn("text-xs font-mono text-muted-foreground", className)}
      {...props}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  CardContent                                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  CardFooter  — bottom bar with border-t, used in terminal           */
/* ------------------------------------------------------------------ */

function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center justify-between border-t border-border px-5 py-3",
        className,
      )}
      {...props}
    />
  )
}

export {
    Card, CardContent, CardDots, CardFooter, CardHeader, CardTitle, cardVariants
}

