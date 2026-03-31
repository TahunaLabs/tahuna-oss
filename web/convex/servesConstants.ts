export const SERVE_STATUS = {
  QUEUED: "queued",
  PROVISIONING: "provisioning",
  STARTING: "starting",
  SERVING: "serving",
  STOPPING: "stopping",
  STOPPED: "stopped",
  FAILED: "failed",
} as const

export const ACTIVE_SERVE_STATUSES: ReadonlySet<string> = new Set([
  SERVE_STATUS.QUEUED,
  SERVE_STATUS.PROVISIONING,
  SERVE_STATUS.STARTING,
  SERVE_STATUS.SERVING,
  SERVE_STATUS.STOPPING,
])

export const TERMINAL_SERVE_STATUSES: ReadonlySet<string> = new Set([
  SERVE_STATUS.STOPPED,
  SERVE_STATUS.FAILED,
])
