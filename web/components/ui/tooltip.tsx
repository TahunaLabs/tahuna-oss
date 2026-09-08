"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      className={cn(className)}
      {...props}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-md border border-border bg-popover px-2 py-1.5 text-sm text-popover-foreground shadow-md data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

/**
 * Renders a truncated `<p>` that only shows a tooltip when the text actually overflows.
 * Pass `tooltip` for cases where the tooltip content differs from the displayed text.
 */
function TruncatedTooltip({
  className,
  tooltip,
  children,
}: {
  className?: string
  tooltip?: React.ReactNode
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLParagraphElement>(null)
  const [isTruncated, setIsTruncated] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setIsTruncated(el.scrollWidth > el.clientWidth)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p ref={ref} className={cn("truncate", className)}>
          {children}
        </p>
      </TooltipTrigger>
      {isTruncated ? <TooltipContent>{tooltip ?? children}</TooltipContent> : null}
    </Tooltip>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, TruncatedTooltip }
