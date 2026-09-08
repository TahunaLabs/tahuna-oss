import { Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

type TableSelectionBarProps = {
  selectedCount: number
  itemLabel: string
  onClearSelection: () => void
  onDeleteSelected?: () => void
  deleteBusy?: boolean
}

function TableSelectionBar({
  selectedCount,
  itemLabel,
  onClearSelection,
  onDeleteSelected,
  deleteBusy = false,
}: TableSelectionBarProps) {
  if (selectedCount <= 0) return null

  const label = selectedCount === 1 ? `1 ${itemLabel} selected` : `${selectedCount} ${itemLabel}s selected`

  return (
    <div className="mb-2 flex items-center justify-between rounded border border-border bg-secondary-faint px-3 py-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        {onDeleteSelected ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete selected ${itemLabel}s`}
            disabled={deleteBusy}
            onClick={onDeleteSelected}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          onClick={onClearSelection}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

export { TableSelectionBar }
