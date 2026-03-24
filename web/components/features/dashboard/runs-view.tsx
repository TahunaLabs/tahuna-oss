"use client"

import { Play } from "lucide-react"
import { useState } from "react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { DashboardTable } from "@/components/features/dashboard/dashboard-table"
import {
  type EnvironmentRow,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
  type RunRow,
} from "@/components/features/dashboard-model"
import { RunDetailPanel } from "@/components/features/dashboard/runs/run-detail-panel"
import { RunsToolbar } from "@/components/features/dashboard/runs/runs-toolbar"
import { RunTableRow } from "@/components/features/dashboard/runs/run-table-row"
import { RunsEmptyState } from "@/components/features/dashboard/runs/runs-empty-state"
import { Card } from "@/components/ui/card"
import { TableHead } from "@/components/ui/table"

export type RunTab = "all" | "active" | "completed"

const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"])
const COMPLETED_STATUSES = new Set(["completed", "failed", "cancelled"])

type RunsViewProps = {
  environments: EnvironmentRow[]
  runs: RunRow[]
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

  const environmentNameById = new Map(environments.map((e) => [String(e.environment_id), e.name]))

  const activeCount = runs.filter((r) => ACTIVE_STATUSES.has(r.status)).length

  const query = searchQuery.trim().toLowerCase()
  const filteredRuns = runs.filter((run) => {
    if (activeTab === "active" && !ACTIVE_STATUSES.has(run.status)) return false
    if (activeTab === "completed" && !COMPLETED_STATUSES.has(run.status)) return false
    if (query) {
      const envName = environmentNameById.get(run.environment_id) ?? ""
      const target = [run.name ?? "", run.status, envName].join(" ").toLowerCase()
      if (!target.includes(query)) return false
    }
    return true
  })

  const noEnvironments = environments.length === 0
  const hasData = filteredRuns.length > 0

  return (
    <DashboardViewLayout
      sectionLabel="Runs"
      title="Runs"
      titleIcon={<Play size={24} />}
      count={runs.length > 0 ? runs.length : undefined}
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
      {noEnvironments ? (
        <RunsEmptyState noEnvironments />
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
              <RunDetailPanel
                runDetail={runDetail}
                runLogs={runLogs}
                runMetrics={runMetrics}
                busy={busy}
                onSelectRun={onSelectRun}
                onCancelRun={onCancelRun}
                onDeleteRuns={onDeleteRuns}
                onShareRun={onShareRun}
              />
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
