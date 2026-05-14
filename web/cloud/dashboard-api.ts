"use client"

import { useAction, useMutation, useQuery } from "convex/react"

import { api } from "@convex/_generated/api"
import type {
  CloudDashboardCheckoutSession,
  CloudDashboardCredits,
  CloudDashboardPaymentTransaction,
  CloudDashboardUsageEvent,
} from "@/cloud/dashboard-api-types"

export function useCloudDashboardCredits(shouldLoad: boolean) {
  return useQuery(api.cloud.billing.getMyCredits, shouldLoad ? {} : "skip") as CloudDashboardCredits | undefined
}

export function useCloudDashboardUsageEvents(shouldLoad: boolean, limit: number) {
  return useQuery(api.cloud.billing.listMyUsageEvents, shouldLoad ? { limit } : "skip") as
    | CloudDashboardUsageEvent[]
    | undefined
}

export function useCloudDashboardPaymentTransactions(shouldLoad: boolean, limit: number) {
  return useQuery(api.cloud.billing.listMyPaymentTransactions, shouldLoad ? { limit } : "skip") as
    | CloudDashboardPaymentTransaction[]
    | undefined
}

export function useEnsureCloudDashboardBillingAccount() {
  return useMutation(api.cloud.billing.ensureMyBillingAccount) as (args: Record<string, never>) => Promise<unknown>
}

export function useCreateCloudDashboardTopUpCheckoutSession() {
  return useAction(api.cloud.billing.createTopUpCheckoutSession) as (args: {
    amount_cents: number
  }) => Promise<CloudDashboardCheckoutSession>
}
