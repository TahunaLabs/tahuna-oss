import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const tableVariants = cva(
  "w-full border-separate border-spacing-0 text-left text-sm text-foreground",
)

const tableHeaderVariants = cva("border-b border-border text-xs")

const tableRowVariants = cva("", {
  variants: {
    variant: {
      default:
        "border-b border-border bg-secondary-faint transition-colors hover:bg-secondary-hover last:border-0",
      head: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

const tableHeadVariants = cva(
  "h-auto px-3 py-2 text-left align-middle text-xs font-medium text-foreground",
)

const tableCellVariants = cva(
  "px-3 py-2 align-middle text-sm [&.text-muted-foreground]:text-xs",
)

function Table({
  className,
  ...props
}: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn(tableVariants({ className }))}
        {...props}
      />
    </div>
  )
}

function TableHeader({
  className,
  ...props
}: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(tableHeaderVariants({ className }))}
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
  ...props
}: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(tableHeadVariants({ className }))}
      {...props}
    />
  )
}

function TableCell({
  className,
  ...props
}: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(tableCellVariants({ className }))}
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
