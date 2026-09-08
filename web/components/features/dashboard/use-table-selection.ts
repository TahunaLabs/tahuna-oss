"use client"

import { useRef, useState } from "react"

function sameIds<TId extends string>(previous: TId[] | null, next: TId[]) {
  if (previous === null) return false
  if (previous.length !== next.length) return false
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] !== next[index]) return false
  }
  return true
}

function useTableSelection<TId extends string>(visibleIds: TId[]) {
  const [selectedIds, setSelectedIds] = useState<Set<TId>>(() => new Set())
  const previousVisibleIdsRef = useRef<TId[] | null>(null)

  // Render-phase prune: drop selections that are no longer visible.
  // Compare by ID content, not array reference, because callers map IDs on each render.
  if (!sameIds(previousVisibleIdsRef.current, visibleIds)) {
    previousVisibleIdsRef.current = visibleIds
    const visibleSet = new Set<TId>(visibleIds)
    setSelectedIds((previous) => {
      let changed = false
      const next = new Set<TId>()
      for (const id of previous) {
        if (visibleSet.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : previous
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
