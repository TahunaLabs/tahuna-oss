"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

type RunsEmptyStateProps = {
  activeTab?: string
  onTriggerRun?: () => void
}

function RunsEmptyState({ activeTab, onTriggerRun }: RunsEmptyStateProps) {
  const message = activeTab !== "all"
    ? `No ${activeTab} runs.`
    : "View and manage your workflow runs. Track builds, deployments, and automated tasks across all your projects."

  return (
    <Card variant="ghost" className="flex min-h-72 items-center justify-center">
      <div className="max-w-md text-center">
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{message}</p>
        {activeTab === "all" && onTriggerRun ? (
          <div className="flex items-center justify-center gap-3">
            <Button type="button" variant="default" size="compact" onClick={onTriggerRun}>
              Trigger run
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export { RunsEmptyState }
