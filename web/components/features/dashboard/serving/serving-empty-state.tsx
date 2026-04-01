"use client"

import { Card } from "@/components/ui/card"

function ServingEmptyState() {
  return (
    <Card variant="ghost" className="flex min-h-72 items-center justify-center">
      <p className="max-w-md text-center text-sm text-muted-foreground">
        No serves yet. Create one with <code>tahuna serve create --from-run &lt;run_id&gt;</code> from a synced
        project.
      </p>
    </Card>
  )
}

export { ServingEmptyState }
