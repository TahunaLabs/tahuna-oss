"use client"

import { useState } from "react"
import { toast } from "sonner"

import { CLOUD_BILLING_CONFIG } from "@/cloud/config"
import { BillingView } from "@/components/cloud/dashboard/billing/billing-view"
import {
  useCreateCloudDashboardTopUpCheckoutSession,
  useCloudDashboardCredits,
  useCloudDashboardPaymentTransactions,
  useRedeemCloudDashboardCode,
} from "@/cloud/dashboard-api"
import { ERROR_MESSAGES } from "@/lib/error-messages"

type Props = { shouldLoadQueries: boolean }

export function BillingContainer({ shouldLoadQueries }: Props) {
  const [customTopUpAmount, setCustomTopUpAmount] = useState("")
  const [checkoutAmountCents, setCheckoutAmountCents] = useState<number | null>(null)
  const [redeemCodeValue, setRedeemCodeValue] = useState("")
  const [redeemCodeBusy, setRedeemCodeBusy] = useState(false)
  const myCredits = useCloudDashboardCredits(shouldLoadQueries)
  const paymentTransactions = useCloudDashboardPaymentTransactions(shouldLoadQueries, 8)
  const createTopUpCheckoutSession = useCreateCloudDashboardTopUpCheckoutSession()
  const redeemCode = useRedeemCloudDashboardCode()

  async function startTopUp(amountCents: number) {
    if (checkoutAmountCents !== null) {
      return
    }
    setCheckoutAmountCents(amountCents)
    try {
      const checkout = await createTopUpCheckoutSession({ amount_cents: amountCents })
      window.location.assign(checkout.url)
    } catch {
      toast.error(ERROR_MESSAGES.failedToStartCheckout)
      setCheckoutAmountCents(null)
    }
  }

  async function redeem(code: string) {
    if (redeemCodeBusy || !code.trim()) {
      return
    }
    setRedeemCodeBusy(true)
    try {
      const result = await redeemCode({ code })
      toast.success(`Credited ${(result.amount_cents_granted / 100).toFixed(2)} ${result.currency}.`)
      setRedeemCodeValue("")
    } catch {
      toast.error("Failed to redeem code.")
    } finally {
      setRedeemCodeBusy(false)
    }
  }

  return (
    <BillingView
      balanceCents={myCredits?.balance_cents ?? 0}
      checkoutAmountCents={checkoutAmountCents}
      customTopUpAmount={customTopUpAmount}
      currency={myCredits?.currency ?? CLOUD_BILLING_CONFIG.currency}
      fixedTopUpAmountCents={[...CLOUD_BILLING_CONFIG.fixedTopUpAmountCents]}
      initialized={myCredits?.initialized === true}
      maximumTopUpAmountCents={CLOUD_BILLING_CONFIG.maximumTopUpAmountCents}
      minimumTopUpAmountCents={CLOUD_BILLING_CONFIG.minimumTopUpAmountCents}
      onCustomTopUpAmountChange={setCustomTopUpAmount}
      onStartTopUp={(amountCents) => { void startTopUp(amountCents) }}
      paymentTransactions={paymentTransactions ?? []}
      redeemCodeBusy={redeemCodeBusy}
      redeemCodeValue={redeemCodeValue}
      onRedeemCodeValueChange={setRedeemCodeValue}
      onRedeemCode={(code) => { void redeem(code) }}
    />
  )
}
