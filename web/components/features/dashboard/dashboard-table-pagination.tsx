type DashboardTablePaginationProps = {
  total: number
  offset: number
  count: number
  hasPrevious: boolean
  hasNext: boolean
  onPrevious?: () => void
  onNext?: () => void
}

function DashboardTablePagination({
  total,
  offset,
  count,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: DashboardTablePaginationProps) {
  const start = total === 0 ? 0 : offset + 1
  const end = total === 0 ? 0 : offset + count

  return (
    <div className="flex items-center justify-between px-1 py-2 text-xs text-muted-foreground">
      <span>
        {start}-{end} of {total}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!hasPrevious || onPrevious === undefined}
          className="text-xs transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext || onNext === undefined}
          className="text-xs transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

export { DashboardTablePagination }
export type { DashboardTablePaginationProps }
