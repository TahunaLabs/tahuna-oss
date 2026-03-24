"use client"

import { Button } from "@/components/ui/button"
import type { Id } from "@convex/_generated/dataModel"
import { ACTIVE_STATUSES, TERMINAL_STATUSES as _TERMINAL_STATUSES } from "@convex/runsConstants"
import { Database, Play, Server, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export type MainSection = "data" | "environments" | "runs"

export const DASHBOARD_VIEW_VALUES = ["storage", "environments", "runs", "machines", "billing", "audit_logs", "settings"] as const
export type DashboardView = (typeof DASHBOARD_VIEW_VALUES)[number]

export const STORAGE_SOURCE_FILTER_VALUES = ["all", "shared", "private"] as const
export type StorageSourceFilter = (typeof STORAGE_SOURCE_FILTER_VALUES)[number]

export type StorageItem = {
  id: string
  source: "data" | "run_artifact"
  visibility: "shared" | "private"
  key: string
  name: string
  path: string
  size: number
  download_url: string
  created_at: number
  run_id?: string
  data_blob_id?: string
}

export const STORAGE_SORT_VALUES = ["created_desc", "created_asc", "name_asc", "name_desc", "size_desc", "size_asc"] as const
export type StorageSort = (typeof STORAGE_SORT_VALUES)[number]

export const RUN_TAB_VALUES = ["all", "active", "completed"] as const
export type RunTab = (typeof RUN_TAB_VALUES)[number]

export type StorageListResult = {
  items: StorageItem[]
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
}

export type EnvironmentRow = {
  environment_id: Id<"environments">
  data_id: string
  access: "private" | "shared"
  created_at: number
  last_updated_at: number
  latest_data_manifest_hash: string | null
  bound_data_ids: string[]
  bound_data_manifest_hashes: string[]
  name: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  python_version: string
  framework: string
  version: string
}

export type EnvironmentConfigDetail = {
  environment: EnvironmentRow
  config_name: string
  config_text: string
}

export type DataBlobRow = {
  blob_id: string
  filename: string
  key: string
  content_type: string
  size: number
  download_url: string
  created_at: number
}

export type RunRow = {
  run_id: Id<"runs">
  name: string
  created_at: number
  uptime_ms: number
  environment_id: string
  status: string
  effective_gpu_type: string
  effective_gpu_count: number
  effective_volume_gb: number
}

export type RunDetail = {
  run_id: string
  name: string
  created_at: number
  uptime_ms: number
  environment_id: string
  input: string
  output: string
  logs: string
  status: string
  error: string
  pod_id: string
  effective_gpu_type: string
  effective_gpu_count: number
  effective_volume_gb: number
  code_manifest_hash: string
  data_manifest_hash: string
  cancellation_requested: boolean
  artifact_keys: string[]
}

export type RunLogsOnlyDetail = {
  run_id: string
  status: string
  logs_path: string
  log_file: string
  note: string
  logs_window: {
    tail_limit: number
    startup_scan_limit: number
    pinned_bootstrap_limit: number
    scanned_tail: number
    scanned_startup: number
    pinned_bootstrap_count: number
    returned_logs: number
    includes_pinned_bootstrap: boolean
  }
  recent_logs: Array<{
    timestamp: number
    level: string
    source: string
    message: string
  }>
}

export type RunMetricsOnlyDetail = {
  run_id: string
  status: string
  metrics_window: {
    scan_limit: number
    series_limit: number
    per_series_limit: number
    scanned_points: number
    scanned_series: number
    returned_series: number
    returned_points: number
    dropped_series_count: number
    dropped_points_count: number
  }
  recent_metrics: Array<{
    timestamp: number
    name: string
    value: number
    step: number | null
    unit: string | null
    source: string
  }>
}

export type MetricChartSeries = {
  name: string
  source: string
  category: "model" | "runtime" | "system"
  latestValue: number
  pointCount: number
  xAxis: "step" | "time"
  points: Array<{ x: number; label: string; value: number; step: number | null }>
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
  { id: "runs", label: "Runs", icon: Play, section: "runs" },
]

export { ACTIVE_STATUSES as CANCELLABLE_STATUSES }
export const TERMINAL_STATUSES = _TERMINAL_STATUSES
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
