import type { Id } from "@convex/_generated/dataModel"

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

export type ProfileDraft = {
  firstName: string
  lastName: string
  addressLine1: string
  addressLine2: string
  country: string
  companyName: string
  companyId: string
  taxId: string
}

export type UserProfileResponse = {
  first_name: string
  last_name: string
  address_line_1: string
  address_line_2: string
  country: string
  company_name: string
  company_id: string
  tax_id: string
  updated_at?: number
}

export const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  firstName: "",
  lastName: "",
  addressLine1: "",
  addressLine2: "",
  country: "",
  companyName: "",
  companyId: "",
  taxId: "",
}

export function toProfileDraft(profile: UserProfileResponse | undefined): ProfileDraft {
  if (!profile) {
    return EMPTY_PROFILE_DRAFT
  }
  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    addressLine1: profile.address_line_1,
    addressLine2: profile.address_line_2,
    country: profile.country,
    companyName: profile.company_name,
    companyId: profile.company_id,
    taxId: profile.tax_id,
  }
}
