import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const tableVariants = cva("w-full caption-bottom text-sm", {
  variants: {
    variant: {
      default: "",
      dashboard: "text-left text-sm text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

const tableHeaderVariants = cva("", {
  variants: {
    variant: {
      default: "[&_tr]:border-b",
      dashboard: "border-b border-border text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

const tableRowVariants = cva("", {
  variants: {
    variant: {
      default:
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      dashboard: "border-b border-border last:border-0",
      "dashboard-head": "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

const tableHeadVariants = cva(
  "h-10 px-2 text-left align-middle font-medium text-muted-foreground",
  {
    variants: {
      variant: {
        default: "",
        dashboard: "h-auto px-3 py-2.5 text-inherit",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

const tableCellVariants = cva("p-2 align-middle", {
  variants: {
    variant: {
      default: "",
      dashboard: "px-3 py-2.5",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function Table({
  className,
  variant,
  ...props
}: React.ComponentProps<"table"> & VariantProps<typeof tableVariants>) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn(tableVariants({ variant, className }))}
        {...props}
      />
    </div>
  )
}

function TableHeader({
  className,
  variant,
  ...props
}: React.ComponentProps<"thead"> & VariantProps<typeof tableHeaderVariants>) {
  return (
    <thead
      data-slot="table-header"
      className={cn(tableHeaderVariants({ variant, className }))}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableRow({
  className,
  variant,
  ...props
}: React.ComponentProps<"tr"> & VariantProps<typeof tableRowVariants>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(tableRowVariants({ variant, className }))}
      {...props}
    />
  )
}

function TableHead({
  className,
  variant,
  ...props
}: React.ComponentProps<"th"> & VariantProps<typeof tableHeadVariants>) {
  return (
    <th
      data-slot="table-head"
      className={cn(tableHeadVariants({ variant, className }))}
      {...props}
    />
  )
}

function TableCell({
  className,
  variant,
  ...props
}: React.ComponentProps<"td"> & VariantProps<typeof tableCellVariants>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(tableCellVariants({ variant, className }))}
      {...props}
    />
  )
}

export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableCellVariants,
  tableHeadVariants,
  tableHeaderVariants,
  tableRowVariants,
  tableVariants,
}
