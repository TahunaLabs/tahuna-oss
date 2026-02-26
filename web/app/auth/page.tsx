"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"
import { AuthPageShell } from "@/components/auth-page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [otp, setOTP] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [needsVerification, setNeedsVerification] = useState(false)

  async function onRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    setNeedsVerification(false)
    setOTP("")

    try {
      const resp = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "sign-in" }),
      })
      const data = (await resp.json()) as { detail?: string }
      if (!resp.ok) {
        throw new Error(data.detail || "failed to request verification code")
      }
      setNeedsVerification(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  async function onVerifyCode() {
    setBusy(true)
    setError("")

    try {
      const verifyResp = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp,
        }),
      })
      const verifyData = (await verifyResp.json()) as { detail?: string }
      if (!verifyResp.ok) {
        throw new Error(verifyData.detail || "failed to verify code")
      }
      router.replace("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthPageShell
      eyebrow="Account Access"
      title="Sign in or sign up"
      subtitle="Use your email and a one-time verification code. New and returning users use the same flow."
    >
      <form onSubmit={onRequestCode} className="space-y-5">
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

        <Button type="submit" disabled={busy || needsVerification} className="w-full sm:w-auto">
          {busy ? "Sending code..." : "Send verification code"}
        </Button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {needsVerification ? (
          <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 space-y-3">
            <p className="text-sm text-foreground">Enter the 6-digit code sent to your email.</p>
            <p className="text-xs text-muted-foreground">
              Verification code sent to <span className="font-medium">{email}</span>.
            </p>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="otp">Verification Code</Label>
                <Input
                  id="otp"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(event) => setOTP(event.target.value)}
                />
              </div>
              <Button type="button" onClick={onVerifyCode} disabled={busy || otp.trim().length !== 6} className="w-full sm:w-auto">
                {busy ? "Verifying..." : "Verify and continue"}
              </Button>
            </div>
          </div>
        ) : null}

      </form>
    </AuthPageShell>
  )
}
