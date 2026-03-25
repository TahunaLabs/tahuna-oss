"use client"

import { Monitor } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { type ApiKeyRow } from "@/components/features/dashboard-settings-model"
import { MachinesEmptyState } from "@/components/features/dashboard/machines/machines-empty-state"
import { MachinesTableView } from "@/components/features/dashboard/machines/machines-table-view"
import { Card } from "@/components/ui/card"
import type { Id } from "@convex/_generated/dataModel"

type MachinesViewProps = {
  keys: ApiKeyRow[]
  revokingId: Id<"apiKeys"> | null
  onRevoke: (id: Id<"apiKeys">, name: string) => void
}

export function MachinesView({ keys, revokingId, onRevoke }: MachinesViewProps) {
  return (
    <DashboardViewLayout
      sectionLabel="Machines"
      title="Machines"
      titleIcon={<Monitor size={24} />}
      toolbar={null}
    >
      {keys.length === 0 ? (
        <MachinesEmptyState />
      ) : (
        <Card variant="surface" className="overflow-hidden">
          <MachinesTableView
            keys={keys}
            revokingId={revokingId}
            onRevoke={onRevoke}
          />
        </Card>
      )}
    </DashboardViewLayout>
  )
}
