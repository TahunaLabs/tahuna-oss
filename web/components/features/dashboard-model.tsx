"use client"

import { Button } from "@/components/ui/button"
import {
  ACTIVE_STATUSES,
  RESOURCE_TYPE_VALUES,
  STORAGE_SORT_VALUES,
  STORAGE_SOURCE_FILTER_VALUES,
  TERMINAL_STATUSES as DASHBOARD_TERMINAL_STATUSES,
} from "@/lib/dashboard-api-types"
import type {
  DataBlobRow,
  EnvironmentConfigDetail,
  EnvironmentRow,
  HillclimbExperiment,
  HillclimbMetricOption,
  HillclimbSessionDetail,
  HillclimbSessionSummary,
  MetricChartSeries,
  ResourceType,
  RunDetail,
  RunLogsOnlyDetail,
  RunMetricsOnlyDetail,
  RunRow,
  ServeLogsOnlyDetail,
  ServeModelSnapshot,
  ServeRow,
  ServeSnapshot,
  StorageItem,
  StorageListResult,
  StorageSort,
  StorageSourceFilter,
} from "@/lib/dashboard-api-types"
import { Database, Play, Rocket, Server, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export type MainSection = "data" | "environments" | "runs"

export const DASHBOARD_VIEW_VALUES = ["overview", "storage", "environments", "serving", "runs", "hillclimb", "machines", "audit_logs", "settings"] as const
export type DashboardView = (typeof DASHBOARD_VIEW_VALUES)[number]

export { RESOURCE_TYPE_VALUES, STORAGE_SORT_VALUES, STORAGE_SOURCE_FILTER_VALUES }
export type {
  DataBlobRow,
  EnvironmentConfigDetail,
  EnvironmentRow,
  HillclimbExperiment,
  HillclimbMetricOption,
  HillclimbSessionDetail,
  HillclimbSessionSummary,
  MetricChartSeries,
  ResourceType,
  RunDetail,
  RunLogsOnlyDetail,
  RunMetricsOnlyDetail,
  RunRow,
  ServeLogsOnlyDetail,
  ServeModelSnapshot,
  ServeRow,
  ServeSnapshot,
  StorageItem,
  StorageListResult,
  StorageSort,
  StorageSourceFilter,
}

export const ENVIRONMENT_ACCESS_FILTER_VALUES = ["all", "private", "shared"] as const
export type EnvironmentAccessFilter = (typeof ENVIRONMENT_ACCESS_FILTER_VALUES)[number]

export const AUDIT_ACTION_FILTER_VALUES = ["all", "active", "completed", "failed", "cancelled", "billing"] as const
export type AuditActionFilter = (typeof AUDIT_ACTION_FILTER_VALUES)[number]

export const RUN_TAB_VALUES = ["all", "active", "completed"] as const
export type RunTab = (typeof RUN_TAB_VALUES)[number]

export function primarySyncedDataHref(dataId: string) {
  const params = new URLSearchParams({
    view: "storage",
    storageQ: dataId,
  })
  return `/dashboard?${params.toString()}`
}

const SYSTEM_METRIC_PREFIXES = ["bootstrap_", "artifacts_"]

function metricCategory(name: string, source: string): MetricChartSeries["category"] {
  const normalizedName = name.trim().toLowerCase()
  const normalizedSource = source.trim().toLowerCase()
  if (normalizedSource === "wandb") {
    return "model"
  }
  if (
    normalizedSource === "bootstrap" ||
    SYSTEM_METRIC_PREFIXES.some((prefix) => normalizedName.startsWith(prefix))
  ) {
    return "system"
  }
  return "runtime"
}

function metricCategoryPriority(category: MetricChartSeries["category"]) {
  if (category === "model") return 0
  if (category === "runtime") return 1
  return 2
}

export function metricSeries(logs: RunMetricsOnlyDetail | undefined) {
  if (!logs) return [] satisfies MetricChartSeries[]
  const grouped = new Map<
    string,
    {
      name: string
      source: string
      category: MetricChartSeries["category"]
      latestValue: number
      latestTimestamp: number
      stepCount: number
      points: Array<{ x: number; label: string; value: number; step: number | null; timestamp: number }>
    }
  >()
  for (const sample of logs.recent_metrics) {
    const groupKey = `${sample.source}:${sample.name}`
    const current = grouped.get(groupKey) || {
      name: sample.name,
      source: sample.source,
      category: metricCategory(sample.name, sample.source),
      latestValue: sample.value,
      latestTimestamp: sample.timestamp,
      stepCount: 0,
      points: [],
    }
    if (sample.step !== null) {
      current.stepCount += 1
    }
    current.points.push({
      x: sample.step ?? sample.timestamp,
      label: sample.step !== null ? `Step ${sample.step}` : new Date(sample.timestamp).toLocaleTimeString(),
      value: sample.value,
      step: sample.step,
      timestamp: sample.timestamp,
    })
    if (sample.timestamp >= current.latestTimestamp) {
      current.latestTimestamp = sample.timestamp
      current.latestValue = sample.value
    }
    grouped.set(groupKey, current)
  }
  return Array.from(grouped.values())
    .map((entry) => ({
      name: entry.name,
      source: entry.source,
      category: entry.category,
      latestValue: entry.latestValue,
      pointCount: entry.points.length,
      xAxis: entry.stepCount > 0 ? "step" : "time",
      latestTimestamp: entry.latestTimestamp,
      points: entry.points
        .sort((a, b) => {
          if (entry.stepCount > 0) {
            return a.x - b.x || a.timestamp - b.timestamp
          }
          return a.timestamp - b.timestamp
        })
        .map(({ timestamp: _timestamp, ...point }) => point),
    }))
    .sort((a, b) => {
      const categoryOrder = metricCategoryPriority(a.category) - metricCategoryPriority(b.category)
      if (categoryOrder !== 0) return categoryOrder
      if (b.pointCount !== a.pointCount) return b.pointCount - a.pointCount
      if (b.latestTimestamp !== a.latestTimestamp) return b.latestTimestamp - a.latestTimestamp
      return a.name.localeCompare(b.name)
    })
    .map(({ latestTimestamp: _latestTimestamp, ...entry }) => entry)
}

export function relativeTime(timestamp: number) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

type SidebarItem = {
  id: string
  label: string
  icon: LucideIcon
  section: MainSection
}

export const PAGE_TITLES: Record<MainSection, string> = {
  data: "Storage",
  environments: "Environments",
  runs: "Runs",
}

export const FEATURE_ITEMS: SidebarItem[] = [
  { id: "data", label: "Storage", icon: Database, section: "data" },
  { id: "environments", label: "Environments", icon: Server, section: "environments" },
  { id: "serving", label: "Serving", icon: Rocket, section: "environments" },
  { id: "runs", label: "Runs", icon: Play, section: "runs" },
]

export { ACTIVE_STATUSES, ACTIVE_STATUSES as CANCELLABLE_STATUSES }
export const TERMINAL_STATUSES = DASHBOARD_TERMINAL_STATUSES
export const STORAGE_PAGE_LIMIT = 25
export const MAX_ARTIFACT_NAME_CHARS = 255

export function formatBytes(size: number) {
  if (size <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** unitIndex
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export function BottomHalfEmptyMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="px-5 text-center text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export function validateArtifactRenameName(value: string) {
  const name = value.trim()
  if (!name) {
    throw new Error("artifact name is required")
  }
  if (name.length > MAX_ARTIFACT_NAME_CHARS) {
    throw new Error(`artifact name must be ${MAX_ARTIFACT_NAME_CHARS} characters or fewer`)
  }
  if (name === "." || name === "..") {
    throw new Error("artifact name is invalid")
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new Error("artifact name must not include path separators")
  }
  if (/[\u0000-\u001f]/.test(name)) {
    throw new Error("artifact name contains unsupported control characters")
  }
  return name
}

export function SidebarSection({
  label,
  items,
  activeSection,
  onSelect,
}: {
  label: string
  items: SidebarItem[]
  activeSection: MainSection
  onSelect: (section: MainSection) => void
}) {
  return (
    <section>
      <p className="px-2 pb-1 pt-2 text-ui-caption font-medium tracking-ui-label text-muted-foreground">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.section === activeSection

          return (
            <Button
              key={item.id}
              type="button"
              size="none"
              variant="nav"
              data-active={isActive || undefined}
              onClick={() => onSelect(item.section)}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
