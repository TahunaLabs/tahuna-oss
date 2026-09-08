"use client"

import { Share2, Trash2, X } from "lucide-react"

import { CANCELLABLE_STATUSES, type RunRow } from "@/components/features/dashboard-model"
import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

type RunActionsMenuProps = {
  run: { run_id: RunRow["run_id"] | string; status: string; name?: string | null }
  busy: boolean
  triggerVariant?: "ghost"
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
            <DropdownMenuItem
              onClick={() => { close(); onShareRun(run.run_id) }}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </DropdownMenuItem>
          ) : null}

          {CANCELLABLE_STATUSES.has(run.status) ? (
            <DropdownMenuItem
              disabled={busy}
              onClick={() => { close(); onCancelRun(run.run_id as RunRow["run_id"]) }}
            >
              <X className="h-3.5 w-3.5" />
              Cancel run
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem
            disabled={busy}
            onClick={() => {
              close()
              void onDeleteRuns([run.run_id as RunRow["run_id"]]).then(() => onSelectRun?.(null))
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete run
          </DropdownMenuItem>
        </>
      )}
    </ActionsMenu>
  )
}

export { RunActionsMenu }
