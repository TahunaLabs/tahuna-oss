"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MachinesView } from "@/components/features/dashboard/machines-view"
import type { ApiKeyRow } from "@/components/features/dashboard-settings-model"
import { useDashboardApiKeys, useRevokeDashboardApiKey } from "@/lib/dashboard-api"
import { ERROR_MESSAGES } from "@/lib/error-messages"

type Props = { shouldLoadQueries: boolean }

export function MachinesContainer({ shouldLoadQueries }: Props) {
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const apiKeys = useDashboardApiKeys(shouldLoadQueries) as ApiKeyRow[] | undefined
  const revokeApiKeyMutation = useRevokeDashboardApiKey()

  async function revokeKey(id: string, name: string) {
    setRevokingId(id)
    try {
      await revokeApiKeyMutation(id)
      toast.success(`Revoked ${name}.`)
    } catch {
      toast.error(ERROR_MESSAGES.failedToRevokeKey)
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <MachinesView
      keys={apiKeys ?? []}
      revokingId={revokingId}
      onRevoke={revokeKey}
    />
  )
}
