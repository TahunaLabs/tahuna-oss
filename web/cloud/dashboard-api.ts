"use client"

import { useAction, useMutation, useQuery } from "convex/react"

import { api } from "@convex/_generated/api"
import type {
  CloudDashboardCredits,
  CloudDashboardUsageEvent,
  CloudRunpodCredentialStatus,
} from "@/cloud/dashboard-api-types"

export function useCloudDashboardCredits(shouldLoad: boolean) {
  return useQuery(api.cloud.billing.getMyCredits, shouldLoad ? {} : "skip") as CloudDashboardCredits | undefined
}

export function useCloudDashboardUsageEvents(shouldLoad: boolean, limit: number) {
  return useQuery(api.cloud.billing.listMyUsageEvents, shouldLoad ? { limit } : "skip") as
    | CloudDashboardUsageEvent[]
    | undefined
}

export function useEnsureCloudDashboardBillingAccount() {
  return useMutation(api.cloud.billing.ensureMyBillingAccount) as (args: Record<string, never>) => Promise<unknown>
}

export function useCloudDashboardRunpodCredentialStatus(shouldLoad: boolean) {
  return useQuery(
    api.cloud.runpodCredentials.getMyRunpodCredentialStatus,
    shouldLoad ? {} : "skip",
  ) as CloudRunpodCredentialStatus | undefined
}

export function useSaveCloudDashboardRunpodCredential() {
  return useAction(api.cloud.runpodCredentials.saveMyRunpodCredential) as (args: { api_key: string }) => Promise<unknown>
}

export function useRevokeCloudDashboardRunpodCredential() {
  return useMutation(api.cloud.runpodCredentials.revokeMyRunpodCredential) as (
    args: Record<string, never>
  ) => Promise<unknown>
}
