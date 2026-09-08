"use client"

import { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import { SettingsView } from "@/components/features/dashboard/settings-view"
import {
  EMPTY_SETTINGS_NAME_FORM_VALUES,
  settingsNameFormSchema,
  type SettingsNameFormValues,
} from "@/components/features/dashboard-settings-model"
import { authClient } from "@/lib/auth-client"

type Props = {
  shouldLoadQueries: boolean
  userName: string
  username: string
  userEmail: string
}

export function SettingsContainer({ shouldLoadQueries, userName, username, userEmail }: Props) {
  const [savingProfile, setSavingProfile] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingsNameFormValues>({
    resolver: zodResolver(settingsNameFormSchema),
    defaultValues: EMPTY_SETTINGS_NAME_FORM_VALUES,
  })

  useEffect(() => {
    if (!shouldLoadQueries) {
      reset(EMPTY_SETTINGS_NAME_FORM_VALUES)
      return
    }
    reset({
      username,
      name: userName,
    })
  }, [reset, shouldLoadQueries, userName, username])

  async function saveProfile(values: SettingsNameFormValues) {
    setSavingProfile(true)
    try {
      const nextUsername = values.username.trim()
      const currentUsername = username.trim()

      if (nextUsername !== currentUsername) {
        const availability = await authClient.isUsernameAvailable({ username: nextUsername })
        if (availability.error) {
          throw new Error(availability.error.message || "Failed to validate username")
        }
        if (availability.data?.available !== true) {
          throw new Error("Username is unavailable")
        }
      }

      const result = await authClient.updateUser({
        username: nextUsername,
        name: values.name.trim(),
      })
      if (result.error) {
        throw new Error(result.error.message || "Failed to save settings")
      }
      reset({
        username: nextUsername,
        name: values.name.trim(),
      })
    } catch (e) {
      throw e instanceof Error ? e : new Error("Failed to save settings")
    } finally {
      setSavingProfile(false)
    }
  }

  const submitProfile = handleSubmit(saveProfile)

  return (
    <SettingsView
      userEmail={userEmail}
      register={register}
      errors={errors}
      savingProfile={savingProfile}
      onSaveProfile={submitProfile}
    />
  )
}
