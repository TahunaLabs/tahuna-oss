import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * Scoped dot-grid panel. Absolutely positioned, fades out via a radial mask,
 * sits behind content. Tint with a text-* utility (dots use currentColor).
 */
export function DotGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "bg-dot-grid pointer-events-none absolute text-foreground/[0.07]",
        "[mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]",
        className,
      )}
    />
  )
}

/**
 * Blueprint-style crosshair tick for grid intersections and frame corners.
 * Pure CSS (two thin bars) — no inline SVG.
 */
export function Crosshair({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute size-3 text-muted-foreground/40", className)}>
      <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-current" />
      <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-current" />
    </span>
  )
}

/** Small bordered chip dropped at an angle — the "hand-placed" accent. */
export function TiltedChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 border border-border bg-card px-3 py-1.5 text-xs text-foreground",
        className,
      )}
    >
      {children}
    </div>
  )
}
