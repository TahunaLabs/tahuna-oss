import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center font-mono uppercase", {
  variants: {
    variant: {
      default:
        "text-[10px] tracking-wider text-muted-foreground border border-border rounded px-2 py-0.5",
      filled:
        "text-xs tracking-widest text-foreground bg-secondary px-2 py-1",
      ghost: "text-xs tracking-widest text-muted-foreground",
      status:
        "bg-muted px-3 py-1 rounded text-xs text-muted-foreground",
      "status-success":
        "text-[10px] tracking-wider border rounded px-2 py-0.5 text-emerald-300 border-emerald-600/50 bg-emerald-900/20",
      "status-warning":
        "text-[10px] tracking-wider border rounded px-2 py-0.5 text-amber-200 border-amber-500/40 bg-amber-900/20",
      "status-info":
        "text-[10px] tracking-wider border rounded px-2 py-0.5 text-cyan-200 border-cyan-500/40 bg-cyan-900/20",
      "status-error":
        "text-[10px] tracking-wider border rounded px-2 py-0.5 text-rose-200 border-rose-500/40 bg-rose-900/20",
    },
  },
  defaultVariants: { variant: "default" },
})

/** Map a run/job status string to the correct Badge variant. */
function statusVariant(
  status: string,
): NonNullable<VariantProps<typeof badgeVariants>["variant"]> {
  if (status === "running" || status === "provisioning") return "status-success"
  if (status === "queued" || status === "cancelling") return "status-warning"
  if (status === "succeeded" || status === "completed") return "status-info"
  if (status === "failed" || status === "cancelled") return "status-error"
  return "default"
}

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { Badge, badgeVariants, statusVariant }
