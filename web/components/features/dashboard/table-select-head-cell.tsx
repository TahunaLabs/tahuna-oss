import { Checkbox } from "@/components/ui/checkbox"
import { TableHead } from "@/components/ui/table"

type TableSelectHeadCellProps = {
  checked: boolean
  indeterminate?: boolean
  ariaLabel: string
  onCheckedChange: (checked: boolean) => void
}

function TableSelectHeadCell({
  checked,
  indeterminate = false,
  ariaLabel,
  onCheckedChange,
}: TableSelectHeadCellProps) {
  return (
    <TableHead className="px-1 align-middle">
      <div className="flex items-center justify-center">
        <Checkbox
          checked={indeterminate ? "indeterminate" : checked}
          aria-label={ariaLabel}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className="border-sidebar-border/60 bg-sidebar-accent/20 hover:border-sidebar-border hover:bg-sidebar-accent/50 hover:shadow-xs"
        />
      </div>
    </TableHead>
  )
}

export { TableSelectHeadCell }
