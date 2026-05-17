export type TahunaId = string

export const RUN_STATUS = {
  QUEUED: "queued",
  PROVISIONING: "provisioning",
  RUNNING: "running",
  CANCELLING: "cancelling",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const

export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

// Client DTO constants mirror the public run lifecycle contract.
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  RUN_STATUS.QUEUED,
  RUN_STATUS.PROVISIONING,
  RUN_STATUS.RUNNING,
  RUN_STATUS.CANCELLING,
])

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.CANCELLED,
])

export const STORAGE_SOURCE_FILTER_VALUES = ["all", "shared", "private"] as const
export type StorageSourceFilter = (typeof STORAGE_SOURCE_FILTER_VALUES)[number]

export const STORAGE_SORT_VALUES = ["created_desc", "created_asc", "name_asc", "name_desc", "size_desc", "size_asc"] as const
export type StorageSort = (typeof STORAGE_SORT_VALUES)[number]

export const RESOURCE_TYPE_VALUES = ["environment", "run", "data"] as const
export type ResourceType = (typeof RESOURCE_TYPE_VALUES)[number]

export type StorageItem = {
  id: string
  source: "data" | "run_artifact"
  object_kind: "data_upload" | "data_manifest" | "run_artifact"
  visibility: "shared" | "private"
  key: string
  name: string
  path: string
  size: number
  download_url: string
  last_modified_at: number
  run?: { id: string; name: string }
  environment?: { id: string; name: string }
  data_blob_id?: string
}

export type StorageListResult = {
  items: StorageItem[]
  total: number
  offset: number
  limit: number
  has_more: boolean
  next_offset: number | null
}

export type ServeSnapshot = {
  command: string[]
  python_version: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  port: number
  health_path: string
  default_model_path: string
  startup_timeout_seconds: number
  health_interval_seconds: number
  health_timeout_seconds: number
  health_failure_threshold: number
  graceful_shutdown_seconds: number
}

export type ServeModelSnapshot = {
  source_type: "run" | "storage"
  source_run_id: string | null
  source_object_prefix: string | null
  source_model_path: string | null
  object_count: number
  total_bytes: number
}

export type ServeRow = {
  serve_id: string
  created_at: number
  environment_id: string
  inference_path: string
  status: string
  error: string
  python_version: string
  gpu_type: string
  gpu_count: number
  volume_gb: number
  model_snapshot: ServeModelSnapshot
}

export type ServeLogsOnlyDetail = {
  serve_id: string
  status: string
  recent_logs: Array<{
    timestamp: number
    level: string
    source: string
    message: string
  }>
}

export type EnvironmentRow = {
  environment_id: string
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
  serve_snapshot: ServeSnapshot | null
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
  last_modified_at: number
}

export type RunRow = {
  run_id: string
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
  provider_machine_id: string
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

export type ApiKeyRow = {
  _id: string
  _creationTime: number
  name: string
  keyPrefix: string
  machineId?: string
  status: "active" | "expired" | "revoked"
  expiresAt: number
  lastUsedAt?: number
  revokedAt?: number
}

export type DashboardUser = {
  email?: string | null
  username?: string | null
  name?: string | null
} | null

export type DashboardShareLink = {
  share_link_id: string
  token: string
  permission: "read" | "edit"
}
