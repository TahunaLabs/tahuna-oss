"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MachinesView } from "@/components/features/dashboard/machines-view"
import type { ApiKeyRow } from "@/components/features/dashboard-settings-model"
import { useDashboardApiKeys, useRevokeDashboardApiKey } from "@/lib/dashboard-api"

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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to revoke key.")
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
