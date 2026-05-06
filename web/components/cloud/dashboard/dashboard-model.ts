import { DASHBOARD_VIEW_VALUES } from "@/components/features/dashboard-model"

export const CLOUD_DASHBOARD_VIEW_VALUES = [
  ...DASHBOARD_VIEW_VALUES,
  "billing",
  "providers",
] as const

export type CloudDashboardView = (typeof CLOUD_DASHBOARD_VIEW_VALUES)[number]
