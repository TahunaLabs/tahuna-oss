export type CloudDashboardCredits = {
  balance_cents: number
  currency: string
  initialized: boolean
}

export type CloudDashboardUsageEvent = {
  event_type: string
  credits_delta_cents: number
  balance_after_cents: number
  reference_type: string | null
  reference_id: string | null
  metadata: unknown | null
  created_at: number
}

export type CloudRunpodCredentialStatus = {
  configured: boolean
  credential_id: string | null
  key_prefix: string
  validated_at?: number
  updated_at?: number
}
