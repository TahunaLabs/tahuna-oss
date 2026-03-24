"use client"

import { useEffect, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"
import { SettingsView } from "@/components/features/dashboard/settings-view"
import {
  EMPTY_PROFILE_DRAFT,
  toProfileDraft,
  type ApiKeyRow,
  type ProfileDraft,
  type RunpodCredentialStatus,
  type ThemeChoice,
  type UserProfileResponse,
} from "@/components/features/dashboard-settings-model"

type Props = {
  shouldLoadQueries: boolean
  theme: ThemeChoice
  onThemeChange: (theme: ThemeChoice) => void
  userEmail: string
}

export function SettingsContainer({ shouldLoadQueries, theme, onThemeChange, userEmail }: Props) {
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingRunpod, setSavingRunpod] = useState(false)
  const [revokingRunpod, setRevokingRunpod] = useState(false)
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT)

  const myProfile = useQuery(api.profile.getMyProfile, shouldLoadQueries ? {} : "skip") as
    | UserProfileResponse
    | undefined
  const runpodStatus = useQuery(
    api.runpodCredentials.getMyRunpodCredentialStatus,
    shouldLoadQueries ? {} : "skip",
  ) as RunpodCredentialStatus | undefined
  const apiKeys = useQuery(api.auth.listApiKeys, shouldLoadQueries ? {} : "skip") as ApiKeyRow[] | undefined

  const saveMyProfileMutation = useMutation(api.profile.saveMyProfile)
  const revokeMyRunpodCredentialMutation = useMutation(api.runpodCredentials.revokeMyRunpodCredential)
  const saveMyRunpodCredentialAction = useAction(api.runpodCredentials.saveMyRunpodCredential)

  // Sync profile draft when server data arrives or auth state changes
  useEffect(() => {
    if (!shouldLoadQueries) {
      setProfileDraft(EMPTY_PROFILE_DRAFT)
      return
    }
    setProfileDraft(toProfileDraft(myProfile))
  }, [myProfile, shouldLoadQueries])

  async function saveProfile(profile: ProfileDraft) {
    setSavingProfile(true)
    try {
      await saveMyProfileMutation({
        first_name: profile.firstName,
        last_name: profile.lastName,
        address_line_1: profile.addressLine1,
        address_line_2: profile.addressLine2,
        country: profile.country,
        company_name: profile.companyName,
        company_id: profile.companyId,
        tax_id: profile.taxId,
      })
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to save settings")
    } finally {
      setSavingProfile(false)
    }
  }

  async function saveRunpodCredential(apiKey: string) {
    setSavingRunpod(true)
    try {
      await saveMyRunpodCredentialAction({ api_key: apiKey })
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to save Runpod API key")
    } finally {
      setSavingRunpod(false)
    }
  }

  async function revokeRunpodCredential() {
    setRevokingRunpod(true)
    try {
      await revokeMyRunpodCredentialMutation({})
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to remove Runpod API key")
    } finally {
      setRevokingRunpod(false)
    }
  }

  return (
    <SettingsView
      theme={theme}
      onThemeChange={onThemeChange}
      userEmail={userEmail}
      apiKeys={apiKeys ?? []}
      runpodCredentialStatus={runpodStatus}
      profile={profileDraft}
      onProfileChange={setProfileDraft}
      savingProfile={savingProfile}
      onSaveProfile={saveProfile}
      savingRunpodCredential={savingRunpod}
      revokingRunpodCredential={revokingRunpod}
      onSaveRunpodCredential={saveRunpodCredential}
      onRevokeRunpodCredential={revokeRunpodCredential}
    />
  )
}
