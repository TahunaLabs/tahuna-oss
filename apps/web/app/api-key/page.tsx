"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
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

type BootstrapResponse = {
  user_id: string
  api_key: string
  api_key_id: string
}

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_TAHUNA_API_URL?.trim() || "http://localhost:8000"

export default function ApiKeyPage() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("cli")
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<BootstrapResponse | null>(null)

  useEffect(() => {
    let active = true

    async function loadMe() {
      try {
        const resp = await fetch("/api/auth/me", { method: "GET" })
        if (!resp.ok) {
          return
        }
        const me = (await resp.json()) as MeResponse
        if (!active) {
          return
        }
        setEmail(me.email ?? "")
      } finally {
        if (active) {
          setLoadingProfile(false)
        }
      }
    }

    loadMe()
    return () => {
      active = false
    }
  }, [])

  const exportSnippet = useMemo(() => {
    if (!result) {
      return ""
    }
    return `export TAHUNA_API_URL=${DEFAULT_API_URL}
export TAHUNA_API_KEY=${result.api_key}`
  }, [result])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setResult(null)

    try {
      const apiKeyResp = await fetch("/api/auth/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
        }),
      })

      const data = await apiKeyResp.json()
      if (!apiKeyResp.ok) {
        throw new Error(data.detail || "failed to create api key")
      }
      setResult(data as BootstrapResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthPageShell
      eyebrow="CLI Credentials"
      title="Get an API key"
      subtitle="Issue an API key for local CLI usage. You must be signed in. Keys are displayed once, so copy them when generated."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Signed In As</Label>
          <Input
            id="email"
            type="email"
            placeholder="Sign in first"
            value={email}
            readOnly
            disabled
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Key Name</Label>
          <Input
            id="name"
            required
            placeholder="cli"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={busy || loadingProfile} className="w-full sm:w-auto">
          {busy ? "Creating key..." : "Create API key"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {result ? (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
            <p className="text-sm">Key ID: <span className="font-mono">{result.api_key_id}</span></p>
            <div className="rounded-md border border-border bg-background/70 p-3 font-mono text-xs break-all">{result.api_key}</div>
            <pre className="rounded-md border border-border bg-background/70 p-3 text-xs overflow-x-auto">
              <code>{exportSnippet}</code>
            </pre>
          </div>
        ) : null}
      </form>
    </AuthPageShell>
  )
}
