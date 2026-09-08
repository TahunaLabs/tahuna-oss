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
          className={cn(
            "border-sidebar-border/60 bg-sidebar-accent/20 transition-[opacity,background-color,border-color,box-shadow] group-hover:border-sidebar-border group-hover:bg-sidebar-accent/50 group-hover:shadow-xs group-hover:opacity-100",
            checked ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
    </TableCell>
  )
}

export { TableSelectCell }
