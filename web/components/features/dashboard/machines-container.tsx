"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { MachinesView } from "@/components/features/dashboard/machines-view"
import type { ApiKeyRow } from "@/components/features/dashboard-settings-model"
import type { Id } from "@convex/_generated/dataModel"

type Props = { shouldLoadQueries: boolean }

export function MachinesContainer({ shouldLoadQueries }: Props) {
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [revokingId, setRevokingId] = useState<Id<"apiKeys"> | null>(null)

  const apiKeys = useQuery(api.auth.listApiKeys, shouldLoadQueries ? {} : "skip") as ApiKeyRow[] | undefined
  const revokeApiKeyMutation = useMutation(api.auth.revokeApiKey)

  async function revokeKey(id: Id<"apiKeys">, name: string) {
    setRevokingId(id)
    setMessage("")
    setError("")
    try {
      await revokeApiKeyMutation({ id })
      setMessage(`Revoked ${name}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key.")
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <MachinesView
      keys={apiKeys ?? []}
      message={message}
      error={error}
      revokingId={revokingId}
      onRevoke={revokeKey}
      onClearFeedback={() => {
        setMessage("")
        setError("")
      }}
    />
  )
}
