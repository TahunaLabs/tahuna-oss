"use client"

import { Settings } from "lucide-react"
import { toast } from "sonner"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import type { ProfileDraft } from "@/components/features/dashboard-settings-model"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type SettingsViewProps = {
  userEmail: string
  profile: ProfileDraft
  onProfileChange: (profile: ProfileDraft) => void
  savingProfile: boolean
  onSaveProfile: (profile: ProfileDraft) => Promise<void>
}

export function SettingsView({
  userEmail,
  profile,
  onProfileChange,
  savingProfile,
  onSaveProfile,
}: SettingsViewProps) {
  async function handleSaveProfile() {
    try {
      await onSaveProfile(profile)
      toast.success("Settings saved.")
    } catch (saveProfileError) {
      toast.error(saveProfileError instanceof Error ? saveProfileError.message : "Failed to save settings")
    }
  }

  return (
    <DashboardViewLayout
      sectionLabel="Settings"
      title="Settings"
      titleIcon={<Settings size={24} />}
      toolbar={null}
    >
      <Card className="p-4">
        <h2 className="text-sm font-medium text-foreground">Account</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">First name</label>
            <Input
              value={profile.firstName}
              onChange={(event) => onProfileChange({ ...profile, firstName: event.target.value })}
              placeholder="First name"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Last name</label>
            <Input
              value={profile.lastName}
              onChange={(event) => onProfileChange({ ...profile, lastName: event.target.value })}
              placeholder="Last name"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm text-muted-foreground">Email</label>
            <Input value={userEmail || "—"} readOnly />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="default"
            size="control"
            disabled={savingProfile}
            onClick={() => { void handleSaveProfile() }}
          >
            {savingProfile ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </Card>
    </DashboardViewLayout>
  )
}
