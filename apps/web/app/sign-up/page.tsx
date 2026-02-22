"use client"

import Link from "next/link"
import { useMemo, useState, type FormEvent } from "react"
import { AuthPageShell } from "@/components/auth-page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type BootstrapResponse = {
  user_id: string
  api_key: string
  api_key_id: string
}

const DEFAULT_ROLE = "user"
const DEFAULT_API_URL = process.env.NEXT_PUBLIC_TAHUNA_API_URL?.trim() || "http://localhost:8000"

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("web-signup")
  const [orgID, setOrgID] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<BootstrapResponse | null>(null)

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
      const bootstrapResp = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role: DEFAULT_ROLE,
          org_id: orgID,
          name,
        }),
      })
      const bootstrapData = await bootstrapResp.json()
      if (!bootstrapResp.ok) {
        throw new Error(bootstrapData.detail || "failed to create account")
      }

      setResult(bootstrapData as BootstrapResponse)

      await fetch("/api/auth/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: (bootstrapData as BootstrapResponse).api_key }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthPageShell
      eyebrow="Account Setup"
      title="Sign up for Tahuna"
      subtitle="Create your account identity and issue your first API key. The API key is shown once and can be used immediately in the CLI."
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Key Name</Label>
            <Input
              id="name"
              required
              placeholder="web-signup"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="org-id">Org ID (optional)</Label>
            <Input
              id="org-id"
              placeholder="acme"
              value={orgID}
              onChange={(event) => setOrgID(event.target.value)}
            />
          </div>
        </div>

        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Creating account..." : "Create account + API key"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {result ? (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
            <p className="text-sm text-foreground">
              API key created for user <span className="font-mono">{result.user_id}</span>.
            </p>
            <div className="rounded-md border border-border bg-background/70 p-3 font-mono text-xs break-all">{result.api_key}</div>
            <pre className="rounded-md border border-border bg-background/70 p-3 text-xs overflow-x-auto">
              <code>{exportSnippet}</code>
            </pre>
            <p className="text-xs text-muted-foreground">
              Save this key now. It will not be shown again. Need another one later? Use{" "}
              <Link href="/api-key" className="text-foreground underline underline-offset-2">
                Get API Key
              </Link>
              .
            </p>
          </div>
        ) : null}
      </form>
    </AuthPageShell>
  )
}
