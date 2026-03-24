import { Checkbox } from "@/components/ui/checkbox"
import { TableCell } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type TableSelectCellProps = {
  checked: boolean
  ariaLabel: string
  onCheckedChange: (checked: boolean) => void
}

function TableSelectCell({
  checked,
  ariaLabel,
  onCheckedChange,
}: TableSelectCellProps) {
  return (
    <TableCell className="px-1 align-middle">
      <div className="flex items-center justify-center">
        <Checkbox
          checked={checked}
          aria-label={ariaLabel}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          className={cn("transition-opacity group-hover:opacity-100", checked ? "opacity-100" : "opacity-0")}
        />
      </div>
    </TableCell>
  )
}

export { TableSelectCell }
