"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, Clock3, Search, XCircle } from "lucide-react"
import type { RunRow } from "@/components/dashboard/shared"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type AuditLogsViewProps = {
  runs: RunRow[]
}

type AuditActionFilter = "all" | "active" | "completed" | "failed" | "cancelled"

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

function formatRunUptime(uptimeMs: number) {
  if (!Number.isFinite(uptimeMs) || uptimeMs <= 0) {
    return "—"
  }
  const totalSeconds = Math.floor(uptimeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
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
        run.status.toLowerCase().includes(searchTerm) ||
        run.effective_gpu_type.toLowerCase().includes(searchTerm) ||
        String(run.effective_gpu_count).includes(searchTerm)
      )
    })
  }, [actionFilter, dateFilter, search, sortedRuns])

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="px-6 py-4 border-b border-border">
        <h1 className="text-sm font-medium text-foreground">Audit logs</h1>
      </header>

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

      <div className="flex-1 overflow-y-auto px-6 py-3">
        {filteredRuns.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            No audit logs match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table variant="dashboard" className="table-fixed">
              <colgroup>
                <col className="w-[46%]" />
                <col className="w-[20%]" />
                <col className="w-[8%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
              </colgroup>
              <TableHeader variant="dashboard">
                <TableRow variant="dashboard-head">
                  <TableHead variant="dashboard">Event</TableHead>
                  <TableHead variant="dashboard">GPU type</TableHead>
                  <TableHead variant="dashboard" className="text-center">GPUs</TableHead>
                  <TableHead variant="dashboard" className="text-center">Uptime</TableHead>
                  <TableHead variant="dashboard">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => {
                  const action = toAuditAction(run.status)
                  const isCompleted = action === "completed"
                  const isFailure = action === "failed" || action === "cancelled"
                  const actionLabel = isCompleted ? "completed" : isFailure ? action : "updated"

                  return (
                    <TableRow key={run.run_id} variant="dashboard" className="hover:bg-secondary/20">
                      <TableCell variant="dashboard">
                        <div className="grid grid-cols-[16px_minmax(0,1fr)] items-start gap-3 min-w-0">
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
                      </TableCell>
                      <TableCell variant="dashboard" className="font-mono text-xs md:text-sm">
                        {run.effective_gpu_type || "—"}
                      </TableCell>
                      <TableCell variant="dashboard" className="text-center">
                        {run.effective_gpu_count > 0 ? run.effective_gpu_count : "—"}
                      </TableCell>
                      <TableCell variant="dashboard" className="text-center">
                        {formatRunUptime(run.uptime_ms)}
                      </TableCell>
                      <TableCell variant="dashboard" className="text-xs text-muted-foreground">
                        {formatAuditTimestamp(run.created_at)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  )
}
