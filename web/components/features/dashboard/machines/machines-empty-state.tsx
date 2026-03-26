"use client"

import { Card } from "@/components/ui/card"

function MachinesEmptyState() {
  return (
    <Card variant="ghost" className="flex min-h-72 items-center justify-center">
      <p className="text-sm text-muted-foreground">No machine sessions found yet.</p>
    </Card>
  )
}

export { MachinesEmptyState }
