"use client"

import { ShieldOff } from "lucide-react"

import { ActionsMenu } from "@/components/features/dashboard/actions-menu"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import type { ApiKeyRow } from "@/components/features/dashboard-settings-model"
import type { Id } from "@convex/_generated/dataModel"

type MachinesActionsMenuProps = {
  apiKey: ApiKeyRow
  busy: boolean
  onRevokeRequest: (id: Id<"apiKeys">, name: string) => void
}

function MachinesActionsMenu({ apiKey, busy, onRevokeRequest }: MachinesActionsMenuProps) {
  return (
    <ActionsMenu triggerLabel={`Open actions for ${apiKey.name}`}>
      {(close) => (
        <DropdownMenuItem
          disabled={busy}
          onClick={() => {
            close()
            onRevokeRequest(apiKey._id, apiKey.name)
          }}
        >
          <ShieldOff className="h-3.5 w-3.5" />
          Revoke session
        </DropdownMenuItem>
      )}
    </ActionsMenu>
  )
}

export { MachinesActionsMenu }
