"use client"

import Link from "next/link"
import { useState, type FormEvent } from "react"
import { AuthPageShell } from "@/components/auth-page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SignUpPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [orgID, setOrgID] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [isComplete, setIsComplete] = useState(false)
  const [emailSent, setEmailSent] = useState<boolean | null>(null)
  const [warning, setWarning] = useState("")

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setIsComplete(false)
    setEmailSent(null)
    setWarning("")

    try {
      const signupResp = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          org_id: orgID,
        }),
      })
      const signupData = (await signupResp.json()) as {
        detail?: string
        email_sent?: boolean
        warning?: string | null
      }
      if (!signupResp.ok) {
        throw new Error(signupData.detail || "failed to create account")
      }
      setEmailSent(Boolean(signupData.email_sent))
      setWarning(signupData.warning || "")
      setIsComplete(true)
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
      subtitle="Create your account with email and password, then get CLI API keys from the API key manager."
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
          {busy ? "Creating account..." : "Create account"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {isComplete ? (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
            <p className="text-sm text-foreground">Account created and signed in.</p>
            {emailSent ? (
              <p className="text-xs text-muted-foreground">
                Confirmation email sent to <span className="font-medium">{email}</span>.
              </p>
            ) : (
              <p className="text-xs text-amber-200">
                We could not confirm email delivery for <span className="font-medium">{email}</span>.
                {warning ? ` ${warning}` : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Ready for CLI access? Open{" "}
              <Link href="/api-key" className="text-foreground underline underline-offset-2">
                Get API Key
              </Link>
              {" "}to generate a dedicated key.
            </p>
          </div>
        ) : null}
      </form>
    </AuthPageShell>
  )
}
