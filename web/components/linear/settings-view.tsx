"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronDown, ChevronUp, KeyRound, Moon, ShieldCheck, Sun } from "lucide-react"
import Link from "next/link"
import type { Id } from "@convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type ApiKeyRow = {
  _id: Id<"apiKeys">
  _creationTime: number
  name: string
  keyPrefix: string
  machineId?: string
  status: "active" | "expired" | "revoked"
  expiresAt: number
  lastUsedAt?: number
  revokedAt?: number
}

type ThemeChoice = "light" | "dark"

type SettingsViewProps = {
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
  userEmail: string
  apiKeys: ApiKeyRow[]
  profile: ProfileDraft
  savingProfile: boolean
  onSaveProfile: (profile: ProfileDraft) => void
}

type ProfileDraft = {
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2: string
  country: string
  companyName: string
  companyId: string
  taxId: string
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—"
  return new Date(timestamp).toLocaleString()
}

function statusVariant(status: ApiKeyRow["status"]) {
  if (status === "active") return "status-success" as const
  if (status === "expired") return "status-warning" as const
  return "status-error" as const
}

function SectionRow({
  title,
  open,
  onToggle,
}: {
  title: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left flex items-center justify-between hover:bg-secondary/30"
      onClick={onToggle}
    >
      <span className="text-sm text-foreground">{title}</span>
      {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
    </button>
  )
}

export function SettingsView({
  theme,
  onThemeChange,
  userEmail,
  apiKeys,
  profile: initialProfile,
  savingProfile,
  onSaveProfile,
}: SettingsViewProps) {
  const [profile, setProfile] = useState<ProfileDraft>(initialProfile)
  const [apiKeysOpen, setApiKeysOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    setProfile(initialProfile)
  }, [initialProfile])

  const activeKeys = useMemo(() => apiKeys.filter((key) => key.status === "active"), [apiKeys])
  const activeSessions = useMemo(
    () => activeKeys.filter((key) => (key.machineId || "").trim().length > 0),
    [activeKeys],
  )

  return (
    <main className="flex-1 h-full overflow-y-auto">
      <header className="px-6 py-4 border-b border-border">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
      </header>

      <div className="px-6 py-5 space-y-6">
        <section className="space-y-2">
          <h2 className="text-base text-foreground">Theme</h2>
          <div className="inline-flex rounded-lg border border-border overflow-hidden bg-card">
            <Button
              type="button"
              variant={theme === "dark" ? "dashboard-tab-compact-active" : "dashboard-tab-compact"}
              size="none"
              className="rounded-none"
              onClick={() => onThemeChange("dark")}
            >
              <Moon className="w-4 h-4" />
              Dark
            </Button>
            <Button
              type="button"
              variant={theme === "light" ? "dashboard-tab-compact-active" : "dashboard-tab-compact"}
              size="none"
              className="rounded-none"
              onClick={() => onThemeChange("light")}
            >
              <Sun className="w-4 h-4" />
              Light
            </Button>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-medium text-foreground">Account information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">First name</label>
              <Input
                variant="dashboard"
                value={profile.firstName}
                onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))}
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Last name</label>
              <Input
                variant="dashboard"
                value={profile.lastName}
                onChange={(event) => setProfile((current) => ({ ...current, lastName: event.target.value }))}
                placeholder="Last name"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Address line 1</label>
              <Input
                variant="dashboard"
                value={profile.addressLine1}
                onChange={(event) => setProfile((current) => ({ ...current, addressLine1: event.target.value }))}
                placeholder="Street address"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Address line 2</label>
              <Input
                variant="dashboard"
                value={profile.addressLine2}
                onChange={(event) => setProfile((current) => ({ ...current, addressLine2: event.target.value }))}
                placeholder="Suite, floor, etc. (optional)"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Country</label>
              <Input
                variant="dashboard"
                value={profile.country}
                onChange={(event) => setProfile((current) => ({ ...current, country: event.target.value }))}
                placeholder="Country"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Company name</label>
              <Input
                variant="dashboard"
                value={profile.companyName}
                onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))}
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Company ID</label>
              <Input
                variant="dashboard"
                value={profile.companyId}
                onChange={(event) => setProfile((current) => ({ ...current, companyId: event.target.value }))}
                placeholder="Company registration ID"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Tax ID</label>
              <Input
                variant="dashboard"
                value={profile.taxId}
                onChange={(event) => setProfile((current) => ({ ...current, taxId: event.target.value }))}
                placeholder="Tax ID"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-muted-foreground mb-1.5">Account email</label>
              <Input variant="dashboard" value={userEmail || "—"} readOnly />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="dashboard-primary"
              size="none"
              disabled={savingProfile}
              onClick={() => onSaveProfile(profile)}
            >
              {savingProfile ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <SectionRow title="API keys" open={apiKeysOpen} onToggle={() => setApiKeysOpen((open) => !open)} />
          {apiKeysOpen ? (
            <Card variant="dashboard" className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {apiKeys.length} total keys, {activeKeys.length} active
                </p>
                <Button asChild type="button" variant="dashboard-outline" size="none">
                  <Link href="/machines">Manage sessions</Link>
                </Button>
              </div>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No API keys created yet.</p>
              ) : (
                <div className="space-y-2">
                  {apiKeys.slice(0, 8).map((key) => (
                    <div key={key._id} className="rounded border border-border px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <KeyRound className="w-4 h-4 text-muted-foreground shrink-0" />
                          <p className="text-sm text-foreground truncate">{key.name}</p>
                          <Badge variant={statusVariant(key.status)}>{key.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}</p>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground truncate">
                        machine: {key.machineId || "n/a"} • last used: {formatDate(key.lastUsedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}

          <SectionRow title="Active sessions" open={sessionsOpen} onToggle={() => setSessionsOpen((open) => !open)} />
          {sessionsOpen ? (
            <Card variant="dashboard" className="p-4 space-y-2">
              {activeSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active machine sessions found.</p>
              ) : (
                activeSessions.map((session) => (
                  <div key={session._id} className="rounded border border-border px-3 py-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-foreground">{session.machineId}</p>
                      <p className="text-xs text-muted-foreground">{session.name}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(session.lastUsedAt)}</p>
                  </div>
                ))
              )}
            </Card>
          ) : null}

          <SectionRow title="Login settings" open={loginOpen} onToggle={() => setLoginOpen((open) => !open)} />
          {loginOpen ? (
            <Card variant="dashboard" className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <p className="text-sm">Email OTP authentication is enabled.</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Password login and social providers are not configured in the current auth schema.
              </p>
            </Card>
          ) : null}
        </section>
      </div>
    </main>
  )
}
