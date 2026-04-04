"use client"

import { LandingNav } from "@/components/landing/landing-nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Notice } from "@/components/ui/notice"
import { authClient } from "@/lib/auth-client"
import { useConvexAuth } from "convex/react"
import { GitHubIcon } from "@/components/icons/github-icon"
import { HuggingFaceIcon } from "@/components/icons/huggingface-icon"
import { ArrowLeft, Mail } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent } from "react"

function resolveRedirectPath(rawRedirect: string | null) {
  if (!rawRedirect) return "/dashboard"
  if (!rawRedirect.startsWith("/")) return "/dashboard"
  if (rawRedirect.startsWith("//")) return "/dashboard"
  return rawRedirect
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated } = useConvexAuth()
  const redirectPath = resolveRedirectPath(searchParams.get("redirect"))

  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [step, setStep] = useState<"email" | "otp">("email")
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState(false)
  const [error, setError] = useState("")

  const otpRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(redirectPath)
    }
  }, [isAuthenticated, redirectPath, router])

  useEffect(() => {
    if (step === "otp") {
      otpRef.current?.focus()
    }
  }, [step])

  async function onSendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      })
      if (error) throw new Error(error.message || "Failed to send code")
      setStep("otp")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  async function onVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const { error } = await authClient.signIn.emailOtp({ email, otp })
      if (error) throw new Error(error.message || "Failed to verify code")
      router.push(redirectPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error")
    } finally {
      setLoading(false)
    }
  }

  async function onSocialSignIn(provider: "github" | "huggingface") {
    setSocialLoading(true)
    setError("")
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: redirectPath,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error")
      setSocialLoading(false)
    }
  }

  function onBack() {
    setStep("email")
    setOtp("")
    setError("")
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Subtle background texture */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage:
            "radial-gradient(circle, currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative flex min-h-screen flex-col">
        <LandingNav />
        <div className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="relative w-full max-w-sm">
            <div className="rounded-xl border border-border bg-card px-6 py-7 shadow-sm">
              {step === "email" ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <h1 className="text-base font-medium tracking-tight text-foreground">
                      Sign in
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Continue with a provider or enter your email.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      disabled={socialLoading || loading}
                      className="w-full bg-foreground text-background hover:bg-foreground/90"
                      onClick={() => onSocialSignIn("github")}
                    >
                      <GitHubIcon className="size-4" />
                      Continue with GitHub
                    </Button>
                    <Button
                      type="button"
                      disabled={socialLoading || loading}
                      className="w-full bg-foreground text-background hover:bg-foreground/90"
                      onClick={() => onSocialSignIn("huggingface")}
                    >
                      <HuggingFaceIcon className="size-4" />
                      Continue with Hugging Face
                    </Button>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">or</span>
                    </div>
                  </div>

                  <form onSubmit={onSendCode} className="space-y-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        required
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>

                    {error ? <Notice variant="error">{error}</Notice> : null}

                    <Button type="submit" disabled={loading || socialLoading} className="w-full">
                      <Mail className="size-4" />
                      {loading ? "Sending…" : "Send code"}
                    </Button>
                  </form>
                </div>
              ) : (
                <form onSubmit={onVerifyCode} className="space-y-5">
                  <div className="space-y-1">
                    <h1 className="text-base font-medium tracking-tight text-foreground">
                      Check your inbox
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      We sent a 6-digit code to{" "}
                      <span className="font-medium text-foreground">{email}</span>.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="otp">Verification code</Label>
                    <Input
                      ref={otpRef}
                      id="otp"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      required
                      placeholder="123456"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                      className="font-mono tracking-widest text-center text-base"
                    />
                  </div>

                  {error ? <Notice variant="error">{error}</Notice> : null}

                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      disabled={loading || otp.length !== 6}
                      className="w-full"
                    >
                      {loading ? "Verifying…" : "Continue"}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onBack}
                      disabled={loading}
                      className="w-full text-muted-foreground"
                    >
                      <ArrowLeft className="size-3.5" />
                      Back
                    </Button>
                  </div>
                </form>
              )}
            </div>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              No password needed — sign in with a provider or email.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
