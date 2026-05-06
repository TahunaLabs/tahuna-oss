"use client"

import { useEffect, useState } from "react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { toast } from "sonner"
import { RunsView } from "@/components/features/dashboard/runs-view"
import {
  RUN_TAB_VALUES,
  TERMINAL_STATUSES,
  type RunDetail,
  type RunLogsOnlyDetail,
  type RunMetricsOnlyDetail,
  type RunRow,
} from "@/components/features/dashboard-model"
import {
  useCancelDashboardRun,
  useDashboardEnvironments,
  useDashboardRunDetail,
  useDashboardRunLogs,
  useDashboardRunMetrics,
  useDashboardRuns,
  useRemoveDashboardRun,
} from "@/lib/dashboard-api"

type Props = {
  shouldLoadQueries: boolean
  onOpenShareDialog: (resourceType: "run", resourceId: string) => void
}

export function RunsContainer({ shouldLoadQueries, onOpenShareDialog }: Props) {
  const [busy, setBusy] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [terminalLogsCache, setTerminalLogsCache] = useState<{ runId: string; logs: RunLogsOnlyDetail } | null>(null)
  const [terminalMetricsCache, setTerminalMetricsCache] = useState<{
    runId: string
    metrics: RunMetricsOnlyDetail
  } | null>(null)

  const [runsTab, setRunsTab] = useQueryState("runTab", parseAsStringLiteral(RUN_TAB_VALUES).withDefault("all"))

  const envResult = useDashboardEnvironments(shouldLoadQueries)
  const runResult = useDashboardRuns(shouldLoadQueries)

  const runs = runResult?.runs
  const environments = envResult?.environments

  const selectedRunFromList = runs?.find((r) => r.run_id === selectedRunId)
  const shouldLoadRunDetail = shouldLoadQueries && selectedRunId !== null && selectedRunFromList !== undefined
  const isSelectedRunTerminal =
    selectedRunFromList !== undefined && TERMINAL_STATUSES.has(selectedRunFromList.status)
  const hasTerminalLogsCache = terminalLogsCache !== null && terminalLogsCache.runId === selectedRunId
  const hasTerminalMetricsCache = terminalMetricsCache !== null && terminalMetricsCache.runId === selectedRunId

  const runDetail = useDashboardRunDetail(selectedRunId, shouldLoadRunDetail) as RunDetail | undefined
  const runLogsLive = useDashboardRunLogs(
    selectedRunId,
    shouldLoadRunDetail && !(isSelectedRunTerminal && hasTerminalLogsCache),
  ) as RunLogsOnlyDetail | undefined
  const runMetricsLive = useDashboardRunMetrics(
    selectedRunId,
    shouldLoadRunDetail && !(isSelectedRunTerminal && hasTerminalMetricsCache),
  ) as RunMetricsOnlyDetail | undefined

  const runLogs = runLogsLive ?? (hasTerminalLogsCache ? terminalLogsCache.logs : undefined)
  const runMetrics = runMetricsLive ?? (hasTerminalMetricsCache ? terminalMetricsCache.metrics : undefined)

  const cancelRunMutation = useCancelDashboardRun()
  const removeRunMutation = useRemoveDashboardRun()

  // Cache logs/metrics for terminal runs so queries can unsubscribe
  useEffect(() => {
    if (isSelectedRunTerminal && runLogsLive && selectedRunId) {
      setTerminalLogsCache({ runId: selectedRunId, logs: runLogsLive })
    }
  }, [isSelectedRunTerminal, runLogsLive, selectedRunId])

  useEffect(() => {
    if (isSelectedRunTerminal && runMetricsLive && selectedRunId) {
      setTerminalMetricsCache({ runId: selectedRunId, metrics: runMetricsLive })
    }
  }, [isSelectedRunTerminal, runMetricsLive, selectedRunId])

  // Clear selected run if it disappears from the list
  useEffect(() => {
    if (selectedRunId === null || runResult === undefined) return
    if (runs?.some((r) => r.run_id === selectedRunId)) return
    setSelectedRunId(null)
    if (terminalLogsCache?.runId === selectedRunId) setTerminalLogsCache(null)
    if (terminalMetricsCache?.runId === selectedRunId) setTerminalMetricsCache(null)
  }, [runResult, selectedRunId, terminalLogsCache, terminalMetricsCache, runs])

  async function withBusy(task: () => Promise<void>) {
    setBusy(true)
    try {
      await task()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "unexpected error")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function cancelRun(runId: RunRow["run_id"]) {
    await withBusy(async () => {
      await cancelRunMutation(runId)
      toast.success(`Run ${runId} cancellation requested.`)
    })
  }

  async function deleteRuns(runIds: RunRow["run_id"][]) {
    if (runIds.length === 0) return
    await withBusy(async () => {
      for (const runId of runIds) {
        await removeRunMutation(runId)
      }
      if (selectedRunId && runIds.includes(selectedRunId)) {
        setSelectedRunId(null)
      }
      const count = runIds.length
      toast.success(count === 1 ? "Deleted 1 run." : `Deleted ${count} runs.`)
    })
  }

  return (
    <>
      <RunsView
        environments={environments}
        runs={runs}
        busy={busy}
        activeTab={runsTab}
        selectedRunId={selectedRunId}
        runDetail={runDetail}
        runLogs={runLogs}
        runMetrics={runMetrics}
        onActiveTabChange={(tab) => { void setRunsTab(tab) }}
        onSelectRun={setSelectedRunId}
        onCancelRun={(runId) => { void cancelRun(runId) }}
        onDeleteRuns={deleteRuns}
        onShareRun={(runId) => onOpenShareDialog("run", runId)}
      />
    </>
  )
}
