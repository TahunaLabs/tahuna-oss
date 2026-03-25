import type { Id } from "@convex/_generated/dataModel"
import { z } from "zod"

export type ApiKeyRow = {
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

export const settingsNameFormSchema = z.object({
  username: z.string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be 30 characters or fewer")
    .regex(/^[a-zA-Z0-9_.]+$/, "Username can only include letters, numbers, underscores, and dots"),
  name: z.string().trim().max(100, "Name must be 100 characters or fewer"),
})

export type SettingsNameFormValues = z.infer<typeof settingsNameFormSchema>

export const EMPTY_SETTINGS_NAME_FORM_VALUES: SettingsNameFormValues = {
  username: "",
  name: "",
}
