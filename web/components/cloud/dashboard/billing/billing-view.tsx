"use client"

import { CreditCard, Wallet } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type UsageEventRow = {
  event_type: string
  credits_delta_cents: number
  balance_after_cents: number
  reference_type: string | null
  reference_id: string | null
  run_name: string | null
  environment_name: string | null
  metadata: unknown | null
  created_at: number
}

type BillingViewProps = {
  balanceCents: number
  bootstrapCreditCents: number
  checkoutAmountCents: number | null
  customTopUpAmount: string
  currency: string
  fixedTopUpAmountCents: number[]
  initialized: boolean
  maximumTopUpAmountCents: number
  minimumTopUpAmountCents: number
  onCustomTopUpAmountChange: (value: string) => void
  onStartTopUp: (amountCents: number) => void
  usageEvents: UsageEventRow[]
}

function formatMoney(cents: number, currency: string) {
  const amount = Math.max(0, cents) / 100
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function formatSignedMoney(cents: number, currency: string) {
  const sign = cents < 0 ? "-" : "+"
  return `${sign}${formatMoney(Math.abs(cents), currency)}`
}

function parseDollarAmountCents(value: string) {
  const normalized = value.trim()
  if (!normalized) {
    return null
  }
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) {
    return null
  }
  return Math.round(amount * 100)
}

function formatShortDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null
  }
  const totalMinutes = Math.max(1, Math.ceil(durationMs / (60 * 1000)))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`
  }
  if (hours > 0) {
    return `${hours}h`
  }
  return `${minutes}m`
}

function eventLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatComputeEventDetails(event: UsageEventRow, currency: string) {
  if (!isRecord(event.metadata)) {
    return null
  }
  const gpuType = readString(event.metadata.gpu_type)
  const gpuCount = readNumber(event.metadata.gpu_count)
  const volumeGb = readNumber(event.metadata.volume_gb)
  const hourlyRateCents = readNumber(event.metadata.hourly_rate_cents)
  const durationMs = readNumber(event.metadata.duration_ms)
  const reservationHours = readNumber(event.metadata.reservation_hours)
  const uptimeLabel = durationMs !== null ? formatShortDuration(durationMs) : null
  const parts = [
    gpuType && gpuCount !== null ? `${gpuType} x${gpuCount}` : gpuType,
    volumeGb !== null ? `${volumeGb}GB` : null,
    hourlyRateCents !== null ? `${formatMoney(hourlyRateCents, currency)}/h` : null,
    uptimeLabel
      ? `${uptimeLabel} uptime`
      : reservationHours !== null
        ? `${reservationHours}h reserved`
        : null,
  ].filter((value): value is string => Boolean(value))
  return parts.length > 0 ? parts.join(" · ") : null
}

export function BillingView({
  balanceCents,
  bootstrapCreditCents,
  checkoutAmountCents,
  customTopUpAmount,
  currency,
  fixedTopUpAmountCents,
  initialized,
  maximumTopUpAmountCents,
  minimumTopUpAmountCents,
  onCustomTopUpAmountChange,
  onStartTopUp,
  usageEvents,
}: BillingViewProps) {
  const customAmountCents = parseDollarAmountCents(customTopUpAmount)
  const customAmountValid =
    customAmountCents !== null &&
    customAmountCents >= minimumTopUpAmountCents &&
    customAmountCents <= maximumTopUpAmountCents
  const checkoutBusy = checkoutAmountCents !== null

  return (
    <DashboardViewLayout
      sectionLabel="Billing"
      title="Billing"
      titleIcon={<Wallet size={24} />}
      toolbar={null}
    >
      <div className="space-y-5">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Account balance</p>
          <p className="mt-1 text-2xl font-medium text-foreground">
            {initialized ? formatMoney(balanceCents, currency) : "Initializing..."}
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded border border-border p-3">
              <p className="text-xs text-muted-foreground">Bootstrap credit</p>
              <p className="mt-1 text-sm text-foreground">{formatMoney(bootstrapCreditCents, currency)}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-muted-foreground">Top-up rate</p>
              <p className="mt-1 text-sm text-foreground">$1 paid = $1 credit</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-muted-foreground">Run launch policy</p>
              <p className="mt-1 text-sm text-foreground">Estimated funds required</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {fixedTopUpAmountCents.map((amountCents) => (
                <Button
                  key={amountCents}
                  type="button"
                  variant="outline"
                  size="control"
                  disabled={checkoutBusy}
                  onClick={() => onStartTopUp(amountCents)}
                >
                  <CreditCard size={14} />
                  Add {formatMoney(amountCents, currency)}
                </Button>
              ))}
            </div>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                if (customAmountValid && customAmountCents !== null) {
                  onStartTopUp(customAmountCents)
                }
              }}
            >
              <Input
                aria-label="Custom top-up amount"
                inputMode="decimal"
                min={minimumTopUpAmountCents / 100}
                max={maximumTopUpAmountCents / 100}
                step="1"
                type="number"
                value={customTopUpAmount}
                placeholder="Custom amount"
                onChange={(event) => onCustomTopUpAmountChange(event.target.value)}
              />
              <Button type="submit" variant="default" size="control" disabled={checkoutBusy || !customAmountValid}>
                <CreditCard size={14} />
                Add custom credit
              </Button>
            </form>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Ledger history</h2>
            <span className="text-xs text-muted-foreground">{usageEvents.length} events</span>
          </div>
          {!initialized ? (
            <p className="mt-3 text-sm text-muted-foreground">Persisting bootstrap ledger entry...</p>
          ) : usageEvents.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No usage events yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow variant="head">
                    <TableHead>Date</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Delta</TableHead>
                    <TableHead className="text-right">Balance after</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageEvents.map((event, index) => {
                    const computeEventDetails = formatComputeEventDetails(event, currency)
                    const runContext = event.run_name || event.environment_name
                      ? [
                          event.run_name ? `run ${event.run_name}` : null,
                          event.environment_name ? `env ${event.environment_name}` : null,
                        ].filter((value): value is string => Boolean(value)).join(" • ")
                      : null
                    return (
                      <TableRow key={`${event.created_at}-${index}`}>
                        <TableCell className="text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div>{eventLabel(event.event_type)}</div>
                          {computeEventDetails ? (
                            <div className="text-xs text-muted-foreground">
                              {computeEventDetails}
                            </div>
                          ) : null}
                          {runContext ? (
                            <div className="text-xs text-muted-foreground">
                              {runContext}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {event.reference_type && event.reference_id
                            ? `${event.reference_type}:${event.reference_id}`
                            : "—"}
                        </TableCell>
                        <TableCell
                         
                          className={`text-right ${event.credits_delta_cents < 0 ? "text-destructive" : "text-success"}`}
                        >
                          {formatSignedMoney(event.credits_delta_cents, currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(event.balance_after_cents, currency)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </DashboardViewLayout>
  )
}
