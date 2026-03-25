import type { Id } from "@convex/_generated/dataModel"

import { CDN_CONFIG } from "@/config"

function providerIcon(filename: string) {
  return `${CDN_CONFIG.baseUrl}${CDN_CONFIG.providerIconsPath}/${filename}`
}

export type ProviderId = "runpod" | "gcp" | "azure" | "aws"

export type ProviderDef = {
  id: ProviderId
  label: string
  logo: string   // path relative to web/public — used with next/image
  supported: boolean
}

export const PROVIDERS_CONFIG: ProviderDef[] = [
  { id: "runpod", label: "Runpod", logo: providerIcon("runpod_logo.png"), supported: true  },
  { id: "gcp",    label: "GCP",    logo: providerIcon("google_logo.svg"), supported: false }, // TODO: implement GCP credentials
  { id: "azure",  label: "Azure",  logo: providerIcon("azure_logo.svg"),  supported: false }, // TODO: implement Azure credentials
  { id: "aws",    label: "AWS",    logo: providerIcon("aws_logo.svg"),     supported: false }, // TODO: implement AWS credentials
]

export type RunpodCredentialStatus = {
  configured: boolean
  credential_id: Id<"runpodCredentials"> | null
  key_prefix: string
  validated_at?: number
  updated_at?: number
}
