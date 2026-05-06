"use client"

import { useState } from "react"

import {
  useCloudDashboardRunpodCredentialStatus,
  useRevokeCloudDashboardRunpodCredential,
  useSaveCloudDashboardRunpodCredential,
} from "@/cloud/dashboard-api"
import { ProvidersView } from "@/components/cloud/dashboard/providers/providers-view"
import type { CloudRunpodCredentialStatus } from "@/cloud/dashboard-api-types"

type Props = {
  shouldLoadQueries: boolean
}

export function ProvidersContainer({ shouldLoadQueries }: Props) {
  const [savingRunpod, setSavingRunpod] = useState(false)
  const [revokingRunpod, setRevokingRunpod] = useState(false)

  const runpodStatus = useCloudDashboardRunpodCredentialStatus(shouldLoadQueries) as
    | CloudRunpodCredentialStatus
    | undefined

  const revokeMyRunpodCredentialMutation = useRevokeCloudDashboardRunpodCredential()
  const saveMyRunpodCredentialAction = useSaveCloudDashboardRunpodCredential()

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
