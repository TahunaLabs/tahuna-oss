"use client"

import { Share2, Trash2, X } from "lucide-react"

import { CANCELLABLE_STATUSES, type RunRow } from "@/components/features/dashboard-model"
import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import { Button } from "@/components/ui/button"

type RunActionsMenuProps = {
  run: { run_id: RunRow["run_id"] | string; status: string; name?: string | null }
  busy: boolean
  triggerVariant?: "dashboard-icon-secondary"
  onSelectRun?: (id: string | null) => void
  onCancelRun: (id: RunRow["run_id"]) => void
  onDeleteRuns: (ids: RunRow["run_id"][]) => Promise<void>
  onShareRun?: (id: string) => void
}

function RunActionsMenu({
  run,
  busy,
  triggerVariant,
  onSelectRun,
  onCancelRun,
  onDeleteRuns,
  onShareRun,
}: RunActionsMenuProps) {
  const label = run.name || "Untitled run"

  return (
    <ActionsMenu triggerLabel={`Open actions for ${label}`} triggerVariant={triggerVariant}>
      {(close) => (
        <>
          {onShareRun ? (
            <Button
              type="button"
              variant="sidebar-menu-item"
              size="none"
              onClick={() => { close(); onShareRun(run.run_id) }}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          ) : null}

          {CANCELLABLE_STATUSES.has(run.status) ? (
            <Button
              type="button"
              variant="sidebar-menu-item"
              size="none"
              disabled={busy}
              onClick={() => { close(); onCancelRun(run.run_id as RunRow["run_id"]) }}
            >
              <X className="h-3.5 w-3.5" />
              Cancel run
            </Button>
          ) : null}

          <Button
            type="button"
            variant="sidebar-menu-item"
            size="none"
            disabled={busy}
            onClick={() => {
              close()
              void onDeleteRuns([run.run_id as RunRow["run_id"]]).then(() => onSelectRun?.(null))
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete run
          </Button>
        </>
      )}
    </ActionsMenu>
  )
}

export { RunActionsMenu }
