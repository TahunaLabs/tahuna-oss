"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { AuthPageShell } from "@/components/auth-page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type MeResponse = {
  user_id: string
  email: string
  role: string
  org_id: string
}

export default function SignInPage() {
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [me, setMe] = useState<MeResponse | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setMe(null)

    try {
      const sessionResp = await fetch("/api/auth/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: apiKey }),
      })
      const sessionData = await sessionResp.json()
      if (!sessionResp.ok) {
        throw new Error(sessionData.detail || "failed to create session")
      }

      const meResp = await fetch("/api/auth/me", { method: "GET" })
      const meData = await meResp.json()
      if (!meResp.ok) {
        throw new Error(meData.detail || "failed to load profile")
      }
      setMe(meData as MeResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthPageShell
      eyebrow="Session Access"
      title="Sign in with API key"
      subtitle="Tahuna currently authenticates with API keys. Enter an existing key to start a browser session for the dashboard flows."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="api-key">API Key</Label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            required
            placeholder="tk_..."
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Signing in..." : "Sign in"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {me ? (
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
            Signed in as <span className="font-medium">{me.email}</span> ({me.role}).
            <br />
            Continue to{" "}
            <Link href="/api-key" className="underline underline-offset-2">
              Get API Key
            </Link>{" "}
            to issue CLI credentials.
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          No key yet? Create one on{" "}
          <Link href="/sign-up" className="text-foreground underline underline-offset-2">
            Sign Up
          </Link>
          .
        </p>
      </form>
    </AuthPageShell>
  )
}
