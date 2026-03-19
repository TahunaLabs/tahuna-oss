"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, KeyRound, Moon, ShieldCheck, Sun } from "lucide-react"
import Link from "next/link"
import type { ApiKeyRow, ProfileDraft, ThemeChoice } from "@/components/dashboard/settings-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Notice } from "@/components/ui/notice"

type SettingsViewProps = {
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
  userEmail: string
  apiKeys: ApiKeyRow[]
  profile: ProfileDraft
  onProfileChange: (profile: ProfileDraft) => void
  savingProfile: boolean
  onSaveProfile: (profile: ProfileDraft) => Promise<void>
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

function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        type="button"
        className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left flex items-center justify-between hover:bg-secondary/30"
        onClick={onToggle}
      >
        <span className="text-sm text-foreground">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}

export function SettingsView({
  theme,
  onThemeChange,
  userEmail,
  apiKeys,
  profile,
  onProfileChange,
  savingProfile,
  onSaveProfile,
}: SettingsViewProps) {
  const [apiKeysOpen, setApiKeysOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saveMessage, setSaveMessage] = useState("")

  const activeKeys = useMemo(() => apiKeys.filter((key) => key.status === "active"), [apiKeys])
  const activeSessions = useMemo(
    () => activeKeys.filter((key) => (key.machineId || "").trim().length > 0),
    [activeKeys],
  )

  async function handleSaveProfile() {
    setSaveError("")
    setSaveMessage("")
    try {
      await onSaveProfile(profile)
      setSaveMessage("Settings saved.")
    } catch (saveProfileError) {
      setSaveError(saveProfileError instanceof Error ? saveProfileError.message : "Failed to save settings")
    }
  }

  return (
    <main className="flex-1 h-full overflow-y-auto">
      <header className="px-6 py-4 border-b border-border">
        <h1 className="text-sm font-medium text-foreground">Settings</h1>
      </header>

      <div className="px-6 py-5 space-y-6">
        {saveError ? <Notice variant="error">{saveError}</Notice> : null}
        {saveMessage ? <Notice>{saveMessage}</Notice> : null}

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
                onChange={(event) => onProfileChange({ ...profile, firstName: event.target.value })}
                placeholder="First name"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Last name</label>
              <Input
                variant="dashboard"
                value={profile.lastName}
                onChange={(event) => onProfileChange({ ...profile, lastName: event.target.value })}
                placeholder="Last name"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Address line 1</label>
              <Input
                variant="dashboard"
                value={profile.addressLine1}
                onChange={(event) => onProfileChange({ ...profile, addressLine1: event.target.value })}
                placeholder="Street address"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Address line 2</label>
              <Input
                variant="dashboard"
                value={profile.addressLine2}
                onChange={(event) => onProfileChange({ ...profile, addressLine2: event.target.value })}
                placeholder="Suite, floor, etc. (optional)"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Country</label>
              <Input
                variant="dashboard"
                value={profile.country}
                onChange={(event) => onProfileChange({ ...profile, country: event.target.value })}
                placeholder="Country"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Company name</label>
              <Input
                variant="dashboard"
                value={profile.companyName}
                onChange={(event) => onProfileChange({ ...profile, companyName: event.target.value })}
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Company ID</label>
              <Input
                variant="dashboard"
                value={profile.companyId}
                onChange={(event) => onProfileChange({ ...profile, companyId: event.target.value })}
                placeholder="Company registration ID"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">Tax ID</label>
              <Input
                variant="dashboard"
                value={profile.taxId}
                onChange={(event) => onProfileChange({ ...profile, taxId: event.target.value })}
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
              onClick={() => {
                void handleSaveProfile()
              }}
            >
              {savingProfile ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <CollapsibleSection
            title="API keys"
            open={apiKeysOpen}
            onToggle={() => setApiKeysOpen((open) => !open)}
          >
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
          </CollapsibleSection>

          <CollapsibleSection
            title="Active sessions"
            open={sessionsOpen}
            onToggle={() => setSessionsOpen((open) => !open)}
          >
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
          </CollapsibleSection>

          <CollapsibleSection
            title="Login settings"
            open={loginOpen}
            onToggle={() => setLoginOpen((open) => !open)}
          >
            <Card variant="dashboard" className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <p className="text-sm">Email OTP authentication is enabled.</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Password login and social providers are not configured in the current auth schema.
              </p>
            </Card>
          </CollapsibleSection>
        </section>
      </div>
    </main>
  )
}
