export type CloudDashboardCredits = {
  balance_cents: number
  currency: string
  initialized: boolean
}

export type CloudDashboardCheckoutSession = {
  checkout_session_id: string
  url: string
}

export type CloudDashboardCodeRedemption = {
  balance_cents: number
  currency: string
  amount_cents_granted: number
}

export type CloudDashboardPaymentTransaction = {
  amount_cents: number
  credits_cents: number
  currency: string
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  created_at: number
  fulfilled_at: number | null
}

export type CloudDashboardUsageEvent = {
  event_type: string
  credits_delta_cents: number
  balance_after_cents: number
  reference_type: string | null
  reference_id: string | null
  metadata: unknown | null
  updated_at: number
}
