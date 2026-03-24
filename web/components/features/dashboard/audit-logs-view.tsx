"use client"

import { useState } from "react"
import { CheckCircle2, ClipboardList, Clock3, Search, XCircle } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import type { RunRow } from "@/components/features/dashboard-model"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type AuditLogsViewProps = {
  runs: RunRow[]
  environmentNameById: ReadonlyMap<string, string>
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

export function AuditLogsView({ runs, environmentNameById }: AuditLogsViewProps) {
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<AuditActionFilter>("all")
  const [dateFilter, setDateFilter] = useState("")

  const searchTerm = search.trim().toLowerCase()
  const filteredRuns = [...runs]
    .sort((a, b) => b.created_at - a.created_at)
    .filter((run) => {
      const action = toAuditAction(run.status)
      if (actionFilter !== "all" && actionFilter !== action) return false
      if (dateFilter && toLocalDateInputValue(run.created_at) !== dateFilter) return false
      if (!searchTerm) return true
      return (
        run.name.toLowerCase().includes(searchTerm) ||
        (environmentNameById.get(run.environment_id) || "").toLowerCase().includes(searchTerm) ||
        run.status.toLowerCase().includes(searchTerm) ||
        run.effective_gpu_type.toLowerCase().includes(searchTerm) ||
        String(run.effective_gpu_count).includes(searchTerm)
      )
    })

  return (
    <DashboardViewLayout
      sectionLabel="Audit logs"
      title="Audit logs"
      titleIcon={<ClipboardList size={24} />}
      toolbar={(
        <div className="flex flex-col gap-2 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              variant="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search logs"
            />
          </div>
          <Select
           
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
           
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </div>
      )}
    >
      {filteredRuns.length === 0 ? (
        <Card className="px-4 py-6 text-center text-sm text-muted-foreground">
          No audit logs match the current filters.
        </Card>
      ) : (
        <Card variant="surface" className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow variant="head">
                  <TableHead>Event</TableHead>
                  <TableHead>GPU type</TableHead>
                  <TableHead className="text-center">GPUs</TableHead>
                  <TableHead className="text-center">Uptime</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => {
                  const action = toAuditAction(run.status)
                  const isCompleted = action === "completed"
                  const isFailure = action === "failed" || action === "cancelled"
                  const actionLabel = isCompleted ? "completed" : isFailure ? action : "updated"
                  const environmentName = environmentNameById.get(run.environment_id) || "Unknown environment"

                  return (
                    <TableRow key={run.run_id} className="hover:bg-secondary/20">
                      <TableCell>
                        <div className="flex items-start gap-3">
                          {isCompleted ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                          ) : isFailure ? (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          ) : (
                            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-status-provisioning" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">
                              <span className="font-semibold">{run.name}</span>{" "}
                              {actionLabel} run
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {run.run_id} • env {environmentName}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {run.effective_gpu_type || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {run.effective_gpu_count > 0 ? run.effective_gpu_count : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatRunUptime(run.uptime_ms)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatAuditTimestamp(run.created_at)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </DashboardViewLayout>
  )
}
