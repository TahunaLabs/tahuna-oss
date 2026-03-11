"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { api } from "@convex/_generated/api"
import { useConvexAuth, useMutation } from "convex/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

function isLocalCallback(rawCallback: string) {
  try {
    const parsed = new URL(rawCallback)
    const host = parsed.hostname.toLowerCase()
    return parsed.protocol === "http:" && (host === "127.0.0.1" || host === "localhost")
  } catch {
    return false
  }
}

export default function CliAuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, isLoading } = useConvexAuth()
  const createApiKeyMutation = useMutation(api.auth.createApiKey)

  const [status, setStatus] = useState<"idle" | "creating" | "redirecting" | "error">("idle")
  const [error, setError] = useState("")

  const state = useMemo(() => searchParams.get("state")?.trim() ?? "", [searchParams])
  const callback = useMemo(() => searchParams.get("callback")?.trim() ?? "", [searchParams])
  const machine = useMemo(() => searchParams.get("machine")?.trim() ?? "", [searchParams])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectPath = `/auth/cli?state=${encodeURIComponent(state)}&callback=${encodeURIComponent(callback)}&machine=${encodeURIComponent(machine)}`
      router.replace(`/auth?redirect=${encodeURIComponent(redirectPath)}`)
    }
  }, [callback, isAuthenticated, isLoading, router, state])

  async function continueLogin() {
    if (!state) {
      setStatus("error")
      setError("Missing login state.")
      return
    }
    if (!callback || !isLocalCallback(callback)) {
      setStatus("error")
      setError("Invalid callback URL. Please restart `tahuna login`.")
      return
    }

    try {
      setStatus("creating")
      setError("")
      const keyName = `cli-login-${Date.now()}`
      const result = await createApiKeyMutation({ name: keyName, machineId: machine || undefined }) as { api_key: string }
      const redirect = new URL(callback)
      redirect.searchParams.set("state", state)
      redirect.searchParams.set("token", result.api_key)

      setStatus("redirecting")
      window.location.href = redirect.toString()
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Failed to complete CLI login.")
    }
  }

  useEffect(() => {
    if (!isLoading && isAuthenticated && status === "idle") {
      void continueLogin()
    }
  }, [isAuthenticated, isLoading, status])

  return (
    <main className="min-h-screen bg-background p-6 md:p-12">
      <div className="mx-auto w-full max-w-xl">
        <Card className="space-y-4 p-6">
          <h1 className="text-xl font-semibold text-foreground">Authorize Tahuna CLI</h1>
          {status === "creating" && <p className="text-sm text-muted-foreground">Creating CLI session token...</p>}
          {status === "redirecting" && <p className="text-sm text-muted-foreground">Redirecting back to your CLI...</p>}
          {status === "error" && <p className="text-sm text-destructive">{error}</p>}
          {status === "idle" && <p className="text-sm text-muted-foreground">Preparing login...</p>}

          {status === "error" ? (
            <Button type="button" onClick={continueLogin}>
              Retry
            </Button>
          ) : null}
        </Card>
      </div>
    </main>
  )
}
