"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Clock3, Search, TriangleAlert, XCircle } from "lucide-react"
import type { RunRow } from "@/components/dashboard/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"

type AuditLogsViewProps = {
  runs: RunRow[]
}

type AuditActionFilter = "all" | "active" | "completed" | "failed" | "cancelled"

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"])
const ACTIVE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"])

function toAuditAction(status: string): Exclude<AuditActionFilter, "all"> {
  if (status === "completed") return "completed"
  if (status === "failed") return "failed"
  if (status === "cancelled") return "cancelled"
  return "active"
}

function formatAuditTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp))
}

function toLocalDateInputValue(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatUptimePercentage(runs: RunRow[]) {
  const terminalRuns = runs.filter((run) => TERMINAL_STATUSES.has(run.status))
  if (terminalRuns.length === 0) return "100.0%"
  const successfulRuns = terminalRuns.filter((run) => run.status === "completed").length
  return `${((successfulRuns / terminalRuns.length) * 100).toFixed(1)}%`
}

export function AuditLogsView({ runs }: AuditLogsViewProps) {
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<AuditActionFilter>("all")
  const [dateFilter, setDateFilter] = useState("")

  const sortedRuns = useMemo(
    () => [...runs].sort((a, b) => b.created_at - a.created_at),
    [runs],
  )

  const filteredRuns = useMemo(() => {
    const searchTerm = search.trim().toLowerCase()
    return sortedRuns.filter((run) => {
      const action = toAuditAction(run.status)
      if (actionFilter !== "all" && actionFilter !== action) {
        return false
      }
      if (dateFilter && toLocalDateInputValue(run.created_at) !== dateFilter) {
        return false
      }
      if (!searchTerm) {
        return true
      }
      return (
        run.name.toLowerCase().includes(searchTerm) ||
        run.run_id.toLowerCase().includes(searchTerm) ||
        run.environment_id.toLowerCase().includes(searchTerm) ||
        run.status.toLowerCase().includes(searchTerm)
      )
    })
  }, [actionFilter, dateFilter, search, sortedRuns])

  const activeRuns = runs.filter((run) => ACTIVE_STATUSES.has(run.status)).length
  const terminalRuns = runs.filter((run) => TERMINAL_STATUSES.has(run.status)).length

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="px-6 py-4 border-b border-border">
        <h1 className="text-sm font-medium text-foreground">Audit logs</h1>
      </header>

      <div className="px-6 py-4 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Run uptime</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{formatUptimePercentage(runs)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Active runs</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{activeRuns}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Terminal runs</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{terminalRuns}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-border">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px_170px] gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              variant="dashboard"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs"
              className="pl-9"
            />
          </div>
          <Select
            variant="dashboard"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value as AuditActionFilter)}
          >
            <option value="all">Filter by action</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Input
            variant="dashboard"
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
        {filteredRuns.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No audit logs match the current filters.
          </div>
        ) : (
          filteredRuns.map((run) => {
            const action = toAuditAction(run.status)
            const isCompleted = action === "completed"
            const isFailure = action === "failed" || action === "cancelled"
            const actionLabel = isCompleted ? "completed" : isFailure ? action : "updated"

            return (
              <article
                key={run.run_id}
                className="rounded-lg border border-border bg-card px-4 py-3 flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                  ) : isFailure ? (
                    <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                  ) : (
                    <Clock3 className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">
                      <span className="font-semibold">{run.name}</span>{" "}
                      {actionLabel} run
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {run.run_id} • env {run.environment_id}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {formatAuditTimestamp(run.created_at)}
                </div>
              </article>
            )
          })
        )}
      </div>

      <footer className="px-6 py-3 border-t border-border text-xs text-muted-foreground flex items-center gap-2">
        <TriangleAlert className="w-3.5 h-3.5" />
        Uptime is computed from terminal runs (completed vs failed/cancelled).
      </footer>
    </main>
  )
}
