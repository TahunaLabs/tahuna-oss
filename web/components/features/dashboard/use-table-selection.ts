"use client"

import { useState } from "react"

function useTableSelection<TId extends string>(visibleIds: TId[]) {
  const [selectedIds, setSelectedIds] = useState<Set<TId>>(() => new Set())
  const [prevVisibleIds, setPrevVisibleIds] = useState(visibleIds)

  // Render-phase prune: drop selections that scrolled out of the visible page
  if (prevVisibleIds !== visibleIds) {
    setPrevVisibleIds(visibleIds)
    const visibleSet = new Set<string>(visibleIds)
    setSelectedIds((previous) => {
      const next = new Set<TId>(Array.from(previous).filter((id) => visibleSet.has(id)))
      return next.size === previous.size ? previous : next
    })
  }

  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected

  function toggleSelected(id: TId) {
    setSelectedIds((previous) => {
      const next = new Set<TId>(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible(checked: boolean) {
    setSelectedIds(() => (checked ? new Set<TId>(visibleIds) : new Set<TId>()))
  }

  function clearSelection() {
    setSelectedIds(new Set<TId>())
  }

  return {
    selectedIds,
    selectedVisibleCount,
    allVisibleSelected,
    someVisibleSelected,
    toggleSelected,
    toggleSelectAllVisible,
    clearSelection,
  }
}

export { useTableSelection }
