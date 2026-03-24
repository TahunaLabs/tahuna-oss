"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronUp, KeyRound, Moon, Settings, ShieldCheck, Sun } from "lucide-react"
import Link from "next/link"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import type { ApiKeyRow, ProfileDraft, ThemeChoice } from "@/components/features/dashboard-settings-model"
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
      <Button
        type="button"
        variant="context-toggle"
        size="none"
        onClick={onToggle}
      >
        <span className="text-sm text-foreground">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </Button>
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
    <DashboardViewLayout
      sectionLabel="Settings"
      title="Settings"
      titleIcon={<Settings size={24} />}
      toolbar={null}
    >
      <div className="space-y-5">
        {saveError ? <Notice variant="error">{saveError}</Notice> : null}
        {saveMessage ? <Notice>{saveMessage}</Notice> : null}

        <Card variant="dashboard" className="p-4">
          <h2 className="text-dashboard-control font-medium text-foreground">Theme</h2>
          <div className="mt-3 inline-flex overflow-hidden rounded-lg border border-border bg-card">
            <Button
              type="button"
              variant="tab"
              data-active={theme === "dark" || undefined}
              size="none"
              className="rounded-none"
              onClick={() => onThemeChange("dark")}
            >
              <Moon className="h-4 w-4" />
              Dark
            </Button>
            <Button
              type="button"
              variant="tab"
              data-active={theme === "light" || undefined}
              size="none"
              className="rounded-none"
              onClick={() => onThemeChange("light")}
            >
              <Sun className="h-4 w-4" />
              Light
            </Button>
          </div>
        </Card>

        <Card variant="dashboard" className="p-4">
          <h2 className="text-dashboard-control font-medium text-foreground">Account information</h2>
          <div className="mt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">First name</label>
              <Input
                variant="dashboard"
                value={profile.firstName}
                onChange={(event) => onProfileChange({ ...profile, firstName: event.target.value })}
                placeholder="First name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Last name</label>
              <Input
                variant="dashboard"
                value={profile.lastName}
                onChange={(event) => onProfileChange({ ...profile, lastName: event.target.value })}
                placeholder="Last name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Address line 1</label>
              <Input
                variant="dashboard"
                value={profile.addressLine1}
                onChange={(event) => onProfileChange({ ...profile, addressLine1: event.target.value })}
                placeholder="Street address"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Address line 2</label>
              <Input
                variant="dashboard"
                value={profile.addressLine2}
                onChange={(event) => onProfileChange({ ...profile, addressLine2: event.target.value })}
                placeholder="Suite, floor, etc. (optional)"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Country</label>
              <Input
                variant="dashboard"
                value={profile.country}
                onChange={(event) => onProfileChange({ ...profile, country: event.target.value })}
                placeholder="Country"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Company name</label>
              <Input
                variant="dashboard"
                value={profile.companyName}
                onChange={(event) => onProfileChange({ ...profile, companyName: event.target.value })}
                placeholder="Company name"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Company ID</label>
              <Input
                variant="dashboard"
                value={profile.companyId}
                onChange={(event) => onProfileChange({ ...profile, companyId: event.target.value })}
                placeholder="Company registration ID"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm text-muted-foreground">Tax ID</label>
              <Input
                variant="dashboard"
                value={profile.taxId}
                onChange={(event) => onProfileChange({ ...profile, taxId: event.target.value })}
                placeholder="Tax ID"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm text-muted-foreground">Account email</label>
              <Input variant="dashboard" value={userEmail || "—"} readOnly />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="default"
                size="control"
                disabled={savingProfile}
                onClick={() => {
                  void handleSaveProfile()
                }}
              >
                {savingProfile ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </Card>

        <Card variant="dashboard" className="p-4">
          <CollapsibleSection
            title="API keys"
            open={apiKeysOpen}
            onToggle={() => setApiKeysOpen((open) => !open)}
          >
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {apiKeys.length} total keys, {activeKeys.length} active
                </p>
                <Button asChild type="button" variant="outline" size="control">
                  <Link href="/machines">Manage sessions</Link>
                </Button>
              </div>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No API keys created yet.</p>
              ) : (
                <div className="space-y-2">
                  {apiKeys.slice(0, 8).map((key) => (
                    <div key={key._id} className="rounded border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <p className="truncate text-sm text-foreground">{key.name}</p>
                          <Badge variant={statusVariant(key.status)}>{key.status}</Badge>
                        </div>
                        <p className="font-mono text-ui-xs text-muted-foreground">{key.keyPrefix}</p>
                      </div>
                      <p className="mt-1 truncate text-ui-xs text-muted-foreground">
                        machine: {key.machineId || "n/a"} • last used: {formatDate(key.lastUsedAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>
        </Card>

        <Card variant="dashboard" className="p-4">
          <CollapsibleSection
            title="Active sessions"
            open={sessionsOpen}
            onToggle={() => setSessionsOpen((open) => !open)}
          >
            <div className="mt-3 space-y-2">
              {activeSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active machine sessions found.</p>
              ) : (
                activeSessions.map((session) => (
                  <div key={session._id} className="flex items-center justify-between gap-3 rounded border border-border p-3">
                    <div>
                      <p className="text-sm text-foreground">{session.machineId}</p>
                      <p className="text-ui-xs text-muted-foreground">{session.name}</p>
                    </div>
                    <p className="text-ui-xs text-muted-foreground">{formatDate(session.lastUsedAt)}</p>
                  </div>
                ))
              )}
            </div>
          </CollapsibleSection>
        </Card>

        <Card variant="dashboard" className="p-4">
          <CollapsibleSection
            title="Login settings"
            open={loginOpen}
            onToggle={() => setLoginOpen((open) => !open)}
          >
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2 text-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />
                <p className="text-sm">Email OTP authentication is enabled.</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Password login and social providers are not configured in the current auth schema.
              </p>
            </div>
          </CollapsibleSection>
        </Card>
      </div>
    </DashboardViewLayout>
  )
}
