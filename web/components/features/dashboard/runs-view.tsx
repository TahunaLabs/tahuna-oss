"use client"

import { Play } from "lucide-react"
import { useMemo, useState } from "react"

import { DashboardViewLayout } from "@/components/app-shell/layout-shell"
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
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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

  const environmentNameById = useMemo(
    () => new Map(environments.map((e) => [String(e.environment_id), e.name])),
    [environments],
  )

  const activeCount = runs.filter((r) => ACTIVE_STATUSES.has(r.status)).length

  const filteredRuns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return runs.filter((run) => {
      if (activeTab === "active" && !ACTIVE_STATUSES.has(run.status)) return false
      if (activeTab === "completed" && !COMPLETED_STATUSES.has(run.status)) return false
      if (query) {
        const envName = environmentNameById.get(run.environment_id) ?? ""
        const target = [run.name ?? "", run.status, envName].join(" ").toLowerCase()
        if (!target.includes(query)) return false
      }
      return true
    })
  }, [activeTab, environmentNameById, runs, searchQuery])

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
          <Card variant="dashboard-surface" className="flex min-h-0 flex-1 overflow-hidden">
            <div className="min-w-0 flex-1 overflow-auto">
              <Table variant="dashboard" className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: "300px" }} />
                  <col style={{ width: "120px" }} />
                  <col style={{ width: "220px" }} />
                  <col style={{ width: "140px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "40px" }} />
                </colgroup>
                <TableHeader variant="dashboard" className="sticky top-0 bg-background">
                  <TableRow variant="dashboard-head" className="text-left">
                    <TableHead variant="dashboard">Name</TableHead>
                    <TableHead variant="dashboard">Status</TableHead>
                    <TableHead variant="dashboard">Environment</TableHead>
                    <TableHead variant="dashboard">Started</TableHead>
                    <TableHead variant="dashboard">Runtime</TableHead>
                    <TableHead variant="dashboard" className="px-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                </TableBody>
              </Table>
            </div>
          </Card>

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
              <Card variant="dashboard-surface" className="px-6 py-10">
                <p className="text-sm text-muted-foreground">Loading run details…</p>
              </Card>
            )
          ) : null}
        </div>
      )}
    </DashboardViewLayout>
  )
}
