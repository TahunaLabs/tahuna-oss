"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@convex/_generated/api"

import { SettingsView } from "@/components/features/dashboard/settings-view"
import {
  EMPTY_PROFILE_DRAFT,
  toProfileDraft,
  type ProfileDraft,
  type UserProfileResponse,
} from "@/components/features/dashboard-settings-model"

type Props = {
  shouldLoadQueries: boolean
  userEmail: string
}

export function SettingsContainer({ shouldLoadQueries, userEmail }: Props) {
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT)

  const myProfile = useQuery(api.profile.getMyProfile, shouldLoadQueries ? {} : "skip") as
    | UserProfileResponse
    | undefined

  const saveMyProfileMutation = useMutation(api.profile.saveMyProfile)

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

  return (
    <SettingsView
      userEmail={userEmail}
      profile={profileDraft}
      onProfileChange={setProfileDraft}
      savingProfile={savingProfile}
      onSaveProfile={saveProfile}
    />
  )
}
