"use client"

import { Play, X } from "lucide-react"
import { useState } from "react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import {
  type EnvironmentRow,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
  type RunRow,
  type RunTab,
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
} from "@/components/features/dashboard-model"
import { RunActionsMenu } from "@/components/features/dashboard/runs/run-actions-menu"
import { RunDashboard } from "@/components/features/dashboard/runs/run-dashboard"
import { RunsToolbar } from "@/components/features/dashboard/runs/runs-toolbar"
import { RunTableRow } from "@/components/features/dashboard/runs/run-table-row"
import { RunsEmptyState } from "@/components/features/dashboard/runs/runs-empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { TableHead } from "@/components/ui/table"

export type { RunTab }

type RunsViewProps = {
  environments: EnvironmentRow[] | undefined
  runs: RunRow[] | undefined
  busy: boolean
  activeTab: RunTab
  selectedRunId: string | null
  runDetail: RunDetail | undefined
  runLogs: RunLogsOnlyDetail | undefined
  runMetrics: RunMetricsOnlyDetail | undefined
  onActiveTabChange: (tab: RunTab) => void
  onSelectRun: (runId: string | null) => void
  onCancelRun: (runId: RunRow["run_id"]) => void
  onDeleteRuns: (runIds: RunRow["run_id"][]) => Promise<void>
  sharedByMeResourceIds?: ReadonlySet<string>
  onShareRun?: (runId: string) => void
}

export function RunsView({
  environments,
  runs,
  busy,
  activeTab,
  selectedRunId,
  runDetail,
  runLogs,
  runMetrics,
  onActiveTabChange,
  onSelectRun,
  onCancelRun,
  onDeleteRuns,
  sharedByMeResourceIds,
  onShareRun,
}: RunsViewProps) {
  const [searchQuery, setSearchQuery] = useState("")

  const environmentNameById = new Map((environments ?? []).map((e) => [String(e.environment_id), e.name]))

  const activeCount = (runs ?? []).filter((r) => ACTIVE_STATUSES.has(r.status)).length

  const query = searchQuery.trim().toLowerCase()
  const filteredRuns = (runs ?? []).filter((run) => {
    if (activeTab === "active" && !ACTIVE_STATUSES.has(run.status)) return false
    if (activeTab === "completed" && !TERMINAL_STATUSES.has(run.status)) return false
    if (query) {
      const envName = environmentNameById.get(run.environment_id) ?? ""
      const target = [run.name ?? "", run.status, envName].join(" ").toLowerCase()
      if (!target.includes(query)) return false
    }
    return true
  })

  const loading = runs === undefined
  const hasData = filteredRuns.length > 0

  return (
    <DashboardViewLayout
      sectionLabel="Runs"
      title="Runs"
      titleIcon={<Play size={24} />}
      count={runs && runs.length > 0 ? runs.length : undefined}
      toolbar={(
        <RunsToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeTab={activeTab}
          activeCount={activeCount}
          onActiveTabChange={onActiveTabChange}
        />
      )}
    >
      {loading ? (
        <Card variant="ghost" className="flex min-h-72 flex-col items-center justify-center gap-3">
          <Spinner />
          <p className="text-sm text-muted-foreground">Loading runs…</p>
        </Card>
      ) : !hasData ? (
        <RunsEmptyState activeTab={activeTab} />
      ) : (
        <div className="space-y-3">
          <DashboardTable
            columns={[
              { role: "main" },
              { role: "meta" },
              { role: "meta" },
              { role: "meta" },
              { role: "meta" },
              { role: "actions" },
            ]}
            headerCells={(
              <>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Runtime</TableHead>
                <TableHead className="px-0" />
              </>
            )}
            pagination={{
              total: filteredRuns.length,
              offset: 0,
              count: filteredRuns.length,
              hasPrevious: false,
              hasNext: false,
            }}
          >
            {filteredRuns.map((run) => (
              <RunTableRow
                key={run.run_id}
                run={run}
                environmentLabel={environmentNameById.get(run.environment_id) ?? "Unknown environment"}
                selected={selectedRunId === run.run_id}
                busy={busy}
                sharedByMeResourceIds={sharedByMeResourceIds}
                onSelectRun={onSelectRun}
                onCancelRun={onCancelRun}
                onDeleteRuns={onDeleteRuns}
                onShareRun={onShareRun}
              />
            ))}
          </DashboardTable>

          {selectedRunId !== null ? (
            runDetail ? (
              <Card variant="default" className="p-5">
                <RunDashboard
                  run={runDetail}
                  logs={runLogs}
                  metrics={runMetrics}
                  environmentLabel={environmentNameById.get(runDetail.environment_id)}
                  actions={(
                    <>
                      <RunActionsMenu
                        run={runDetail}
                        busy={busy}
                        triggerVariant="ghost"
                        onSelectRun={onSelectRun}
                        onCancelRun={onCancelRun}
                        onDeleteRuns={onDeleteRuns}
                        onShareRun={onShareRun}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-control"
                        aria-label="Close run details"
                        onClick={() => onSelectRun(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                />
              </Card>
            ) : (
              <Card variant="surface" className="px-6 py-10">
                <p className="text-sm text-muted-foreground">Loading run details…</p>
              </Card>
            )
          ) : null}
        </div>
      )}
    </DashboardViewLayout>
  )
}
