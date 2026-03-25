"use client"

import { Settings } from "lucide-react"
import type { FieldErrors, UseFormRegister } from "react-hook-form"
import { toast } from "sonner"

import { DashboardViewLayout } from "@/components/app-shell/dashboard-view-layout"
import type { SettingsNameFormValues } from "@/components/features/dashboard-settings-model"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type SettingsViewProps = {
  userEmail: string
  register: UseFormRegister<SettingsNameFormValues>
  errors: FieldErrors<SettingsNameFormValues>
  savingProfile: boolean
  onSaveProfile: () => Promise<void>
}

export function SettingsView({
  userEmail,
  register,
  errors,
  savingProfile,
  onSaveProfile,
}: SettingsViewProps) {
  async function handleSaveProfile() {
    try {
      await onSaveProfile()
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
            <label className="mb-1.5 block text-sm text-muted-foreground">Username</label>
            <Input
              placeholder="Username"
              {...register("username")}
            />
            {errors.username ? (
              <p className="mt-1 text-xs text-destructive">{errors.username.message}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-muted-foreground">Name</label>
            <Input
              placeholder="Name"
              {...register("name")}
            />
            {errors.name ? (
              <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-sm text-muted-foreground">Email</label>
            <Input value={userEmail || "—"} disabled />
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
