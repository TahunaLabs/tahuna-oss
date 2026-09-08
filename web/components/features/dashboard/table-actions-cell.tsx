import { type ReactNode } from "react"

import { TableCell } from "@/components/ui/table"

type TableActionsCellProps = {
  children: ReactNode
  stopRowClick?: boolean
}

function TableActionsCell({
  children,
  stopRowClick = false,
}: TableActionsCellProps) {
  return (
    <TableCell
      className="px-0 align-middle"
      onClick={stopRowClick ? (event) => event.stopPropagation() : undefined}
    >
      <div className="flex items-center justify-center">
        {children}
      </div>
    </TableCell>
  )
}

export { TableActionsCell }
