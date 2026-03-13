"use client"

import { Button } from "@/components/ui/button"
import type { Id } from "@convex/_generated/dataModel"
import { Database, Play, Server, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export type MainSection = "data" | "environments" | "runs"

export type StorageSourceFilter = "all" | "data" | "run_artifact"

export type StorageItem = {
  id: string
  source: "data" | "run_artifact"
  key: string
  name: string
  path: string
  size: number
  download_url: string
  created_at: number
  run_id?: string
  data_blob_id?: string
}

export type StorageSort =
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "size_desc"
  | "size_asc"

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
  bound_data_ids: string[]
  bound_data_manifest_hashes: string[]
  name: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  framework: string
  version: string
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

export type RunLogsDetail = {
  run_id: string
  status: string
  logs_path: string
  log_file: string
  note: string
  recent_logs: Array<{
    timestamp: number
    level: string
    source: string
    message: string
  }>
  recent_metrics: Array<{
    timestamp: number
    name: string
    value: number
    step: number | null
    unit: string | null
    source: string
  }>
}

export function metricSeries(logs: RunLogsDetail | undefined) {
  if (!logs) return []
  const grouped = new Map<string, Array<{ x: number; label: string; value: number }>>()
  for (const sample of logs.recent_metrics) {
    const points = grouped.get(sample.name) || []
    points.push({
      x: sample.timestamp,
      label: new Date(sample.timestamp).toLocaleTimeString(),
      value: sample.value,
    })
    grouped.set(sample.name, points)
  }
  return Array.from(grouped.entries()).map(([name, points]) => ({
    name,
    points: points.sort((a, b) => a.x - b.x),
  }))
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

export const CANCELLABLE_STATUSES = new Set(["queued", "provisioning", "running", "cancelling"])
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
      <p className="px-2 pb-1 pt-2 text-[11px] font-medium tracking-[0.01em] text-muted-foreground">{label}</p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.section === activeSection

          return (
            <Button
              key={item.id}
              type="button"
              size="none"
              variant={isActive ? "dashboard-nav-active" : "dashboard-nav"}
              onClick={() => onSelect(item.section)}
            >
              <Icon className="h-[15px] w-[15px]" />
              {item.label}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
