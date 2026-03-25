"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"

import { ProvidersView } from "@/components/features/dashboard/providers-view"
import type { RunpodCredentialStatus } from "@/components/features/dashboard-providers-model"

type Props = {
  shouldLoadQueries: boolean
}

export function ProvidersContainer({ shouldLoadQueries }: Props) {
  const [savingRunpod, setSavingRunpod] = useState(false)
  const [revokingRunpod, setRevokingRunpod] = useState(false)

  const runpodStatus = useQuery(
    api.runpodCredentials.getMyRunpodCredentialStatus,
    shouldLoadQueries ? {} : "skip",
  ) as RunpodCredentialStatus | undefined

  const revokeMyRunpodCredentialMutation = useMutation(api.runpodCredentials.revokeMyRunpodCredential)
  const saveMyRunpodCredentialAction = useAction(api.runpodCredentials.saveMyRunpodCredential)

  async function saveRunpodCredential(apiKey: string) {
    setSavingRunpod(true)
    try {
      await saveMyRunpodCredentialAction({ api_key: apiKey })
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to save Runpod API key")
    } finally {
      setSavingRunpod(false)
    }
  }

  async function revokeRunpodCredential() {
    setRevokingRunpod(true)
    try {
      await revokeMyRunpodCredentialMutation({})
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to remove Runpod API key")
    } finally {
      setRevokingRunpod(false)
    }
  }

  return (
    <ProvidersView
      runpodStatus={runpodStatus}
      savingRunpod={savingRunpod}
      revokingRunpod={revokingRunpod}
      onSaveRunpod={saveRunpodCredential}
      onRevokeRunpod={revokeRunpodCredential}
    />
  )
}
