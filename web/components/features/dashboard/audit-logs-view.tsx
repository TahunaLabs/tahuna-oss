"use client"

import { useState } from "react"
import { CheckCircle2, ClipboardList, Clock3, CreditCard, Search, XCircle } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { type AuditActionFilter, type RunRow } from "@/components/features/dashboard-model"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type UsageEventRow = {
  event_type: string
  credits_delta_cents: number
  balance_after_cents: number
  reference_type: string | null
  reference_id: string | null
  metadata: unknown | null
  created_at: number
}

type AuditLogsViewProps = {
  runs: RunRow[]
  usageEvents: UsageEventRow[]
  environmentNameById: ReadonlyMap<string, string>
}

type AuditRow = {
  id: string
  action: Exclude<AuditActionFilter, "all">
  title: string
  detail: string
  amount: string
  timestamp: number
  tone: "success" | "danger" | "active" | "billing"
}

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

function formatMoney(cents: number) {
  const amount = Math.abs(cents) / 100
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function eventLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function runAuditRows(runs: RunRow[], environmentNameById: ReadonlyMap<string, string>): AuditRow[] {
  return runs.map((run) => {
    const action = toAuditAction(run.status)
    const environmentName = environmentNameById.get(run.environment_id) || "Unknown environment"
    const title = `${run.name} ${action === "active" ? "updated" : action} run`
    const gpuLabel = run.effective_gpu_type || "Unknown GPU"
    return {
      id: `run:${run.run_id}`,
      action,
      title,
      detail: `env ${environmentName} · ${gpuLabel}`,
      amount: formatRunUptime(run.uptime_ms),
      timestamp: run.created_at,
      tone: action === "completed" ? "success" : action === "failed" || action === "cancelled" ? "danger" : "active",
    }
  })
}

function billingAuditRows(usageEvents: UsageEventRow[]): AuditRow[] {
  return usageEvents.map((event, index) => ({
    id: `billing:${event.created_at}:${index}`,
    action: "billing",
    title: eventLabel(event.event_type),
    detail: `Balance after ${formatMoney(event.balance_after_cents)}`,
    amount: `${event.credits_delta_cents < 0 ? "-" : "+"}${formatMoney(event.credits_delta_cents)}`,
    timestamp: event.created_at,
    tone: "billing",
  }))
}

function AuditIcon({ row }: { row: AuditRow }) {
  if (row.tone === "success") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
  if (row.tone === "danger") return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
  if (row.tone === "billing") return <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
  return <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-status-provisioning" />
}

export function AuditLogsView({ runs, usageEvents, environmentNameById }: AuditLogsViewProps) {
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<AuditActionFilter>("all")
  const [dateFilter, setDateFilter] = useState("")

  const rows = [
    ...runAuditRows(runs, environmentNameById),
    ...billingAuditRows(usageEvents),
  ].sort((a, b) => b.timestamp - a.timestamp)

  const searchTerm = search.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (actionFilter !== "all" && actionFilter !== row.action) return false
    if (dateFilter && toLocalDateInputValue(row.timestamp) !== dateFilter) return false
    if (!searchTerm) return true
    return [row.title, row.detail, row.amount, row.action]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm)
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
            <option value="billing">Billing</option>
          </Select>
          <Input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </div>
      )}
    >
      {filteredRows.length === 0 ? (
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
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-secondary/20">
                    <TableCell>
                      <div className="flex items-start gap-3">
                        <AuditIcon row={row} />
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{row.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{row.detail}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm">{row.amount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatAuditTimestamp(row.timestamp)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </DashboardViewLayout>
  )
}
