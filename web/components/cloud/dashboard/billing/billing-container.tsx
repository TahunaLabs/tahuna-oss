"use client"

import { useState } from "react"
import { toast } from "sonner"

import { CLOUD_BILLING_CONFIG } from "@/cloud/config"
import { BillingView } from "@/components/cloud/dashboard/billing/billing-view"
import {
  useCreateCloudDashboardTopUpCheckoutSession,
  useCloudDashboardCredits,
} from "@/cloud/dashboard-api"

type Props = { shouldLoadQueries: boolean }

export function BillingContainer({ shouldLoadQueries }: Props) {
  const [customTopUpAmount, setCustomTopUpAmount] = useState("")
  const [checkoutAmountCents, setCheckoutAmountCents] = useState<number | null>(null)
  const myCredits = useCloudDashboardCredits(shouldLoadQueries)
  const createTopUpCheckoutSession = useCreateCloudDashboardTopUpCheckoutSession()

  async function startTopUp(amountCents: number) {
    if (checkoutAmountCents !== null) {
      return
    }
    setCheckoutAmountCents(amountCents)
    try {
      const checkout = await createTopUpCheckoutSession({ amount_cents: amountCents })
      window.location.assign(checkout.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start checkout.")
      setCheckoutAmountCents(null)
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
    />
  )
}
