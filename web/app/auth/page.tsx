"use client"

import { AuthPageShell } from "@/components/auth-page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { useConvexAuth } from "convex/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState, type FormEvent } from "react"

function resolveRedirectPath(rawRedirect: string | null) {
  if (!rawRedirect) return "/dashboard"
  if (!rawRedirect.startsWith("/")) return "/dashboard"
  if (rawRedirect.startsWith("//")) return "/dashboard"
  return rawRedirect
}

export default function AuthPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated } = useConvexAuth()
  const redirectPath = resolveRedirectPath(searchParams.get("redirect"))
  
  const [email, setEmail] = useState("")
  const [otp, setOTP] = useState("")
  const [sendingCode, setSendingCode] = useState(false)
  const [verifyingCode, setVerifyingCode] = useState(false)
  const [error, setError] = useState("")
  const [needsVerification, setNeedsVerification] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectPath)
    }
  }, [isAuthenticated, redirectPath, router])

  async function onRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSendingCode(true)
    setError("")
    setNeedsVerification(false)
    setOTP("")

    try {
      const { data, error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      })
      if (error) {
        throw new Error(error.message || "failed to request verification code")
      }
      setNeedsVerification(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setSendingCode(false)
    }
  }

  async function onVerifyCode() {
    setVerifyingCode(true)
    setError("")

    try {
      const { data, error } = await authClient.signIn.emailOtp({
        email,
        otp,
      })
      if (error) {
        throw new Error(error.message || "failed to verify code")
      }
      
      router.push(redirectPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : "unexpected error")
    } finally {
      setVerifyingCode(false)
    }
  }

  return (
    <AuthPageShell
      eyebrow="Account Access"
      title="Sign in or sign up"
      subtitle="Simply enter your email and we'll send a magic code to your inbox."
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

        <Button type="submit" disabled={sendingCode || needsVerification} className="w-full sm:w-auto">
          {sendingCode ? "Sending code..." : "Send verification code"}
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
              <Button type="button" onClick={onVerifyCode} disabled={verifyingCode || otp.trim().length !== 6} className="w-full sm:w-auto">
                {verifyingCode ? "Verifying..." : "Verify and continue"}
              </Button>
            </div>
          </div>
        ) : null}

      </form>
    </AuthPageShell>
  )
}
