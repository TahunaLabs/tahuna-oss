export const RUN_STATUS = {
  QUEUED: "queued",
  PROVISIONING: "provisioning",
  RUNNING: "running",
  CANCELLING: "cancelling",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export const ACTIVE_STATUSES: ReadonlySet<string> = new Set([
  RUN_STATUS.QUEUED,
  RUN_STATUS.PROVISIONING,
  RUN_STATUS.RUNNING,
  RUN_STATUS.CANCELLING,
]);

export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  RUN_STATUS.COMPLETED,
  RUN_STATUS.FAILED,
  RUN_STATUS.CANCELLED,
]);

// Max records to query+delete per table per batch when deleting a run.
// Each table read counts as 1 + N (index scan + rows returned), and each delete
// is 1 read. With 5 tables: 5 × (1 + 300) queries + 5 × 300 deletes = ~3005,
// safely under Convex's 4096 read limit per transaction.
export const RUN_DELETE_BATCH_SIZE = 300;
