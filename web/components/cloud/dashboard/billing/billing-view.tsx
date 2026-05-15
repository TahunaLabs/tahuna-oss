"use client"

import { useState } from "react"
import { CreditCard, Wallet } from "lucide-react"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CloudDashboardPaymentTransaction } from "@/cloud/dashboard-api-types"

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
  paymentTransactions: CloudDashboardPaymentTransaction[]
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

function formatPlainMoney(cents: number) {
  return `$${(Math.max(0, cents) / 100).toFixed(0)}`
}

function formatTransactionTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp))
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
  paymentTransactions,
}: BillingViewProps) {
  const [selectedFixedAmountCents, setSelectedFixedAmountCents] = useState(fixedTopUpAmountCents[0] ?? null)
  const customAmountCents = parseDollarAmountCents(customTopUpAmount)
  const customAmountValid =
    customAmountCents !== null &&
    customAmountCents >= minimumTopUpAmountCents &&
    customAmountCents <= maximumTopUpAmountCents
  const selectedCustomAmountCents = customAmountValid ? customAmountCents : null
  const selectedAmountCents = selectedCustomAmountCents ?? selectedFixedAmountCents
  const checkoutBusy = checkoutAmountCents !== null

  return (
    <DashboardViewLayout
      sectionLabel="Billing"
      title="Billing"
      titleIcon={<Wallet size={24} />}
      toolbar={null}
    >
      <Card className="mx-auto w-full max-w-6xl p-6">
        <div>
          <p className="text-lg font-medium text-foreground">Account balance</p>
          <p className="mt-2 text-4xl font-medium text-foreground">
            {initialized ? formatMoney(balanceCents, currency) : "Computing..."}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded border border-border p-5">
            <p className="text-sm text-muted-foreground">Spend limit</p>
            <p className="mt-3 font-mono text-base text-foreground">Not configured</p>
          </div>
          <div className="rounded border border-border p-5">
            <p className="text-sm text-muted-foreground">Current spend rate</p>
            <p className="mt-3 font-mono text-base text-foreground">$0.00 / hr</p>
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <p className="text-sm text-muted-foreground">Choose an amount to add.</p>

          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-wrap gap-0">
              {fixedTopUpAmountCents.map((amountCents) => (
                <Button
                  key={amountCents}
                  type="button"
                  variant={selectedCustomAmountCents === null && selectedFixedAmountCents === amountCents ? "secondary" : "outline"}
                  size="default"
                  disabled={checkoutBusy}
                  onClick={() => {
                    setSelectedFixedAmountCents(amountCents)
                    onCustomTopUpAmountChange("")
                  }}
                >
                  {formatPlainMoney(amountCents)}
                </Button>
              ))}
              <Button
                type="button"
                variant={selectedCustomAmountCents !== null ? "secondary" : "outline"}
                size="default"
                disabled={checkoutBusy}
                onClick={() => onCustomTopUpAmountChange(customTopUpAmount || String(minimumTopUpAmountCents / 100))}
              >
                Other
              </Button>
            </div>

            <Button
              type="button"
              variant="default"
              size="default"
              disabled={checkoutBusy || selectedAmountCents === null}
              onClick={() => {
                if (selectedAmountCents !== null) {
                  onStartTopUp(selectedAmountCents)
                }
              }}
            >
              <CreditCard size={14} />
              Pay with card
            </Button>
          </div>

          {customTopUpAmount.trim() ? (
            <form
              className="mt-4 flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                if (customAmountValid && customAmountCents !== null) {
                  onStartTopUp(customAmountCents)
                }
              }}
            >
              <Input
                className="h-9"
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
              <Button type="submit" variant="outline" size="default" disabled={checkoutBusy || !customAmountValid}>
                Use custom amount
              </Button>
            </form>
          ) : null}
        </div>

        <div className="mt-6 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-medium text-foreground">Payment history</p>
              <p className="mt-1 text-sm text-muted-foreground">Card payments made to Tahuna.</p>
            </div>
          </div>

          {paymentTransactions.length === 0 ? (
            <div className="mt-4 rounded border border-border px-4 py-5 text-sm text-muted-foreground">
              No payments yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded border border-border">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow variant="head">
                    <TableHead>Time</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentTransactions.map((transaction) => (
                    <TableRow key={`${transaction.created_at}:${transaction.stripe_checkout_session_id}`}>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatTransactionTimestamp(transaction.fulfilled_at ?? transaction.created_at)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMoney(transaction.amount_cents, transaction.currency || currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {formatMoney(transaction.credits_cents, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>
    </DashboardViewLayout>
  )
}
