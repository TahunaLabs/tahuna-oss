"use client"

import { CreditCard, Wallet } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type BillingViewProps = {
  balanceCents: number
  checkoutAmountCents: number | null
  customTopUpAmount: string
  currency: string
  fixedTopUpAmountCents: number[]
  initialized: boolean
  maximumTopUpAmountCents: number
  minimumTopUpAmountCents: number
  onCustomTopUpAmountChange: (value: string) => void
  onStartTopUp: (amountCents: number) => void
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

export function BillingView({
  balanceCents,
  checkoutAmountCents,
  customTopUpAmount,
  currency,
  fixedTopUpAmountCents,
  initialized,
  maximumTopUpAmountCents,
  minimumTopUpAmountCents,
  onCustomTopUpAmountChange,
  onStartTopUp,
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
      <Card className="max-w-3xl p-4">
        <p className="text-sm font-medium text-muted-foreground">Current balance</p>
        <p className="mt-2 text-3xl font-medium text-foreground">
          {initialized ? formatMoney(balanceCents, currency) : "Initializing..."}
        </p>

        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium text-foreground">Add credits</p>
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
                {formatMoney(amountCents, currency)}
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
              aria-label="Custom credit amount"
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
              Add credit
            </Button>
          </form>
        </div>
      </Card>
    </DashboardViewLayout>
  )
}
