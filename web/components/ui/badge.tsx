import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const badgeVariants = cva("inline-flex items-center font-mono", {
  variants: {
    variant: {
      default:
        "rounded-full border border-border px-2 py-0.5 text-ui-micro tracking-wider text-muted-foreground",
      filled:
        "bg-secondary px-2 py-1 text-xs uppercase tracking-widest text-foreground",
      ghost: "text-xs uppercase tracking-widest text-muted-foreground",
      status:
        "rounded bg-muted px-3 py-1 text-xs uppercase text-muted-foreground",
      "status-success":
        "rounded px-2 py-0.5 text-ui-micro uppercase tracking-wider badge-status-success",
      "status-warning":
        "rounded px-2 py-0.5 text-ui-micro uppercase tracking-wider badge-status-warning",
      "status-info":
        "rounded px-2 py-0.5 text-ui-micro uppercase tracking-wider badge-status-info",
      "status-error":
        "rounded px-2 py-0.5 text-ui-micro uppercase tracking-wider badge-status-error",
      "run-status":
        "rounded-full border border-border px-2.5 py-1 text-ui-caption capitalize tracking-normal text-muted-foreground",
      data:
        "max-w-full truncate rounded bg-secondary px-2 py-0.5 text-xs font-sans normal-case tracking-normal text-foreground",
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
