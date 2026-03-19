"use client"

import { Button } from "@/components/ui/button"

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
  currency: string
  initialized: boolean
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

export function BillingView({ balanceCents, bootstrapCreditCents, currency, initialized, usageEvents }: BillingViewProps) {
  return (
    <main className="flex-1 h-full overflow-y-auto">
      <header className="px-6 py-4 border-b border-border">
        <h1 className="text-sm font-medium text-foreground">Billing</h1>
      </header>

      <div className="px-6 py-5 space-y-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Account balance</p>
          <p className="mt-1 text-3xl font-semibold text-foreground">
            {initialized ? formatMoney(balanceCents, currency) : "Initializing..."}
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded border border-border p-3">
              <p className="text-xs text-muted-foreground">Bootstrap credit</p>
              <p className="mt-1 text-lg text-foreground">{formatMoney(bootstrapCreditCents, currency)}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-muted-foreground">Manual top-up</p>
              <p className="mt-1 text-lg text-foreground">Disabled</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-muted-foreground">Payment checkout</p>
              <p className="mt-1 text-lg text-foreground">Coming soon</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="dashboard-outline" size="none" disabled>
              Add payment method (soon)
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base text-foreground">Ledger history</h2>
            <span className="text-xs text-muted-foreground">{usageEvents.length} events</span>
          </div>
          {!initialized ? (
            <p className="mt-3 text-sm text-muted-foreground">Persisting bootstrap ledger entry...</p>
          ) : usageEvents.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No usage events yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[780px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 text-xs text-muted-foreground font-medium">Date</th>
                    <th className="py-2 text-xs text-muted-foreground font-medium">Event</th>
                    <th className="py-2 text-xs text-muted-foreground font-medium text-right">Delta</th>
                    <th className="py-2 text-xs text-muted-foreground font-medium text-right">Balance after</th>
                  </tr>
                </thead>
                <tbody>
                  {usageEvents.map((event, index) => {
                    const computeEventDetails = formatComputeEventDetails(event, currency)
                    const runContext = event.run_name || event.environment_name
                      ? [
                          event.run_name ? `run ${event.run_name}` : null,
                          event.environment_name ? `env ${event.environment_name}` : null,
                        ].filter((value): value is string => Boolean(value)).join(" • ")
                      : null
                    return (
                      <tr key={`${event.created_at}-${index}`} className="border-b border-border/60">
                        <td className="py-2 text-sm text-muted-foreground">
                          {new Date(event.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 text-sm text-foreground">
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
                        </td>
                        <td
                          className={`py-2 text-sm text-right ${event.credits_delta_cents < 0 ? "text-red-400" : "text-green-400"}`}
                        >
                          {formatSignedMoney(event.credits_delta_cents, currency)}
                        </td>
                        <td className="py-2 text-sm text-right text-foreground">
                          {formatMoney(event.balance_after_cents, currency)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
