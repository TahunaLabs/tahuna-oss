"use client"

import { useState } from "react"
import { ShieldCheck } from "lucide-react"

import type { RunpodCredentialStatus } from "@/components/features/dashboard-settings-model"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Notice } from "@/components/ui/notice"

type RunpodSettingsCardProps = {
  status?: RunpodCredentialStatus
  saving: boolean
  revoking: boolean
  onSave: (apiKey: string) => Promise<void>
  onRevoke: () => Promise<void>
}

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return "—"
  }
  return new Date(timestamp).toLocaleString()
}

export function RunpodSettingsCard({
  status,
  saving,
  revoking,
  onSave,
  onRevoke,
}: RunpodSettingsCardProps) {
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function handleSave() {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      setError("Runpod API key is required.")
      setMessage("")
      return
    }
    setError("")
    setMessage("")
    try {
      await onSave(trimmed)
      setApiKey("")
      setMessage(status?.configured ? "Runpod API key replaced." : "Runpod API key saved.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save Runpod API key.")
    }
  }

  async function handleRevoke() {
    setError("")
    setMessage("")
    try {
      await onRevoke()
      setApiKey("")
      setMessage("Runpod API key disabled for new launches.")
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to remove Runpod API key.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Add your Runpod API key to use Runpod GPUs in Tahuna.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Changes apply to new launches only.
          </p>
        </div>
        <Badge variant={status?.configured ? "status-success" : "status-warning"}>
          {status?.configured ? "configured" : "not configured"}
        </Badge>
      </div>

      {error ? <Notice variant="error">{error}</Notice> : null}
      {message ? <Notice>{message}</Notice> : null}

      {status?.configured ? (
        <div className="rounded border border-border p-3">
          <div className="flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-4 w-4 text-success" />
            <p className="text-sm">Active Runpod key is available.</p>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-muted-foreground md:grid-cols-3">
            <p>prefix: {status.key_prefix || "—"}</p>
            <p>validated: {formatDate(status.validated_at)}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="block text-sm text-muted-foreground">
          {status?.configured ? "Replace Runpod API key" : "Runpod API key"}
        </label>
        <Input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Paste your Runpod API key"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {status?.configured ? (
          <Button
            type="button"
            variant="outline"
            size="control"
            disabled={saving || revoking}
            onClick={() => {
              void handleRevoke()
            }}
          >
            {revoking ? "Disabling..." : "Disable key"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="default"
          size="control"
          disabled={saving || revoking}
          onClick={() => {
            void handleSave()
          }}
        >
          {saving ? "Saving..." : status?.configured ? "Replace key" : "Save key"}
        </Button>
      </div>
    </div>
  )
}
