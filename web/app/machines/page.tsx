"use client"

import { DashboardContentShell } from "@/components/app-shell/layout-shell"
import { type ApiKeyRow, MachinesView } from "@/components/features/dashboard/machines-view"
import { PageLoader } from "@/components/ui/spinner"
import { api } from "@convex/_generated/api"
import type { Id } from "@convex/_generated/dataModel"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { useState } from "react"

export default function MachinesPage() {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const shouldLoadQueries = !isLoading && isAuthenticated
  const keys = useQuery(api.auth.listApiKeys, shouldLoadQueries ? {} : "skip") as ApiKeyRow[] | undefined
  const revokeApiKeyMutation = useMutation(api.auth.revokeApiKey)

  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [revokingId, setRevokingId] = useState<Id<"apiKeys"> | null>(null)

  async function revokeKey(id: Id<"apiKeys">, name: string) {
    setRevokingId(id)
    setMessage("")
    setError("")
    try {
      await revokeApiKeyMutation({ id })
      setMessage(`Revoked ${name}.`)
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke key.")
    } finally {
      setRevokingId(null)
    }
  }

  if (isLoading || !isAuthenticated) {
    return <PageLoader message="Loading machines…" />
  }

  return (
    <DashboardContentShell>
      <MachinesView
        keys={keys ?? []}
        message={message}
        error={error}
        revokingId={revokingId}
        onRevoke={revokeKey}
        onClearFeedback={() => {
          setMessage("")
          setError("")
        }}
      />
    </DashboardContentShell>
  )
}
