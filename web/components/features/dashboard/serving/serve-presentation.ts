import {
  formatBytes,
  type ServeModelSnapshot,
  type ServeRow,
} from "@/components/features/dashboard-model"
import { formatGpuLabel } from "@/components/features/dashboard/environments/environment-card"
import type { StatusDotVariant } from "@/components/ui/status-dot"

export function formatServeStatus(status: string) {
  const normalized = status.trim()
  if (!normalized) {
    return "Unknown"
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function serveStatusDotVariant(status: string): StatusDotVariant {
  switch (status) {
    case "starting":
      return "provisioning"
    case "serving":
      return "running"
    case "stopping":
      return "cancelling"
    case "stopped":
      return "cancelled"
    case "queued":
    case "provisioning":
    case "failed":
      return status
    default:
      return "muted"
  }
}

export function formatServeDevice(serve: Pick<ServeRow, "gpu_type" | "gpu_count" | "volume_gb">) {
  return `${formatGpuLabel(serve.gpu_type)} x${serve.gpu_count} · ${serve.volume_gb}GB`
}

export function formatServeSource(snapshot: ServeModelSnapshot) {
  if (snapshot.source_type === "run") {
    return snapshot.source_run_id ? `Run ${snapshot.source_run_id}` : "Run snapshot"
  }
  return snapshot.source_object_prefix ? `Storage ${snapshot.source_object_prefix}` : "Storage snapshot"
}

export function formatServeSnapshotSize(snapshot: ServeModelSnapshot) {
  return `${snapshot.object_count} objects · ${formatBytes(snapshot.total_bytes)}`
}

export function canStopServe(status: string) {
  return status !== "stopped" && status !== "failed"
}
