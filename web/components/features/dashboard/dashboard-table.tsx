import { type ReactNode } from "react"

import { DashboardTablePagination, type DashboardTablePaginationProps } from "@/components/features/dashboard/dashboard-table-pagination"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

type DashboardTableProps = {
  columns?: DashboardTableColumn[]
  headerCells: ReactNode
  children: ReactNode
  pagination: DashboardTablePaginationProps
  className?: string
  contentClassName?: string
  tableClassName?: string
}

type DashboardTableColumnRole = "select" | "main" | "meta" | "actions"

type DashboardTableColumn = {
  role: DashboardTableColumnRole
  className?: string
}

const DASHBOARD_TABLE_ROLE_WIDTH_CLASS: Record<DashboardTableColumnRole, string> = {
  select: "w-10",
  main: "w-80",
  meta: "w-28",
  actions: "w-14",
}

function DashboardTable({
  columns,
  headerCells,
  children,
  pagination,
  className,
  contentClassName,
  tableClassName,
}: DashboardTableProps) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <Card
        variant="surface"
        className="flex min-h-0 flex-1 overflow-hidden"
      >
        <div className={cn("min-w-0 flex-1 overflow-auto", contentClassName)}>
          <Table className={cn("w-full table-fixed", tableClassName)}>
            {columns?.length ? (
              <colgroup>
                {columns.map((column, index) => (
                  <col
                    key={index}
                    className={cn(DASHBOARD_TABLE_ROLE_WIDTH_CLASS[column.role], column.className)}
                  />
                ))}
              </colgroup>
            ) : null}
            <TableHeader className="sticky top-0 bg-background">
              <TableRow variant="head" className="text-left">
                {headerCells}
              </TableRow>
            </TableHeader>
            <TableBody>{children}</TableBody>
          </Table>
        </div>
      </Card>
      <DashboardTablePagination {...pagination} />
    </div>
  )
}

export { DashboardTable }
export type { DashboardTableColumn, DashboardTableColumnRole }
