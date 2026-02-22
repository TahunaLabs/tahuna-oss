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
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [me, setMe] = useState<MeResponse | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setMe(null)

    try {
      const signinResp = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
        }),
      })
      const signinData = await signinResp.json()
      if (!signinResp.ok) {
        throw new Error(signinData.detail || "failed to sign in")
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
      title="Sign in to Tahuna"
      subtitle="Sign in with your account email and password to start a browser session. Generate CLI API keys in the API key manager."
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
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Signing in..." : "Sign in"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {me ? (
          <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
            Signed in as <span className="font-medium">{me.email}</span>.
            <br />
            Continue to{" "}
            <Link href="/api-key" className="underline underline-offset-2">
              Get API Key
            </Link>{" "}
            to issue CLI credentials.
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          New here? Create your account on{" "}
          <Link href="/sign-up" className="text-foreground underline underline-offset-2">
            Sign Up
          </Link>
          .
        </p>
      </form>
    </AuthPageShell>
  )
}
