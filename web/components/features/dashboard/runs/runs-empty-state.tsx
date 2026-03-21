"use client"

import { Button } from "@/components/ui/button"

type RunsEmptyStateProps = {
  noEnvironments?: boolean
  activeTab?: string
  onTriggerRun?: () => void
}

function RunsEmptyState({ noEnvironments, activeTab, onTriggerRun }: RunsEmptyStateProps) {
  const message = noEnvironments
    ? "Create an environment first to launch runs. Run tahuna init . from your project folder."
    : activeTab !== "all"
      ? `No ${activeTab} runs.`
      : "View and manage your workflow runs. Track builds, deployments, and automated tasks across all your projects."

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{message}</p>
        {!noEnvironments && activeTab === "all" && onTriggerRun ? (
          <div className="flex items-center justify-center gap-3">
            <Button type="button" variant="dashboard-primary-compact" size="none" onClick={onTriggerRun}>
              Trigger run
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export { RunsEmptyState }
