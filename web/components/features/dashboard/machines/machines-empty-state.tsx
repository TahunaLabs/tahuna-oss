"use client"

import { Card } from "@/components/ui/card"

function MachinesEmptyState() {
  return (
    <Card variant="surface" className="p-6">
      <p className="text-sm text-muted-foreground">No machine sessions found yet.</p>
    </Card>
  )
}

export { MachinesEmptyState }
