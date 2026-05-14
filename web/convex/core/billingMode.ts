import { v } from "convex/values";

export const BILLING_MODE = {
  MANAGED: "managed",
  BYOK: "byok",
} as const;

export type BillingMode = (typeof BILLING_MODE)[keyof typeof BILLING_MODE];

export const billingModeValidator = v.union(
  v.literal(BILLING_MODE.MANAGED),
  v.literal(BILLING_MODE.BYOK),
);

export function normalizeBillingMode(value: string | undefined | null): BillingMode {
  return value === BILLING_MODE.BYOK ? BILLING_MODE.BYOK : BILLING_MODE.MANAGED;
}

export function runBillingMode(run: { billingMode?: string }): BillingMode {
  return normalizeBillingMode(run.billingMode);
}
