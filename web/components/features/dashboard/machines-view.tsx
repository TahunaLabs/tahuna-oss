"use client"

import { Monitor } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { type ApiKeyRow } from "@/components/features/dashboard-settings-model"
import { MachinesEmptyState } from "@/components/features/dashboard/machines/machines-empty-state"
import { MachinesTableView } from "@/components/features/dashboard/machines/machines-table-view"

type MachinesViewProps = {
  keys: ApiKeyRow[]
  revokingId: string | null
  onRevoke: (id: string, name: string) => void
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
        <MachinesTableView
          keys={keys}
          revokingId={revokingId}
          onRevoke={onRevoke}
        />
      )}
    </DashboardViewLayout>
  )
}
