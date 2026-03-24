"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { MachinesView } from "@/components/features/dashboard/machines-view"
import type { ApiKeyRow } from "@/components/features/dashboard-settings-model"
import type { Id } from "@convex/_generated/dataModel"

type Props = { shouldLoadQueries: boolean }

export function MachinesContainer({ shouldLoadQueries }: Props) {
  const [revokingId, setRevokingId] = useState<Id<"apiKeys"> | null>(null)

  const apiKeys = useQuery(api.auth.listApiKeys, shouldLoadQueries ? {} : "skip") as ApiKeyRow[] | undefined
  const revokeApiKeyMutation = useMutation(api.auth.revokeApiKey)

  async function revokeKey(id: Id<"apiKeys">, name: string) {
    setRevokingId(id)
    try {
      await revokeApiKeyMutation({ id })
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
