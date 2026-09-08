import {
  ACTIVE_RUN_STATUSES,
  RUN_LIFECYCLE_STATUS,
  TERMINAL_RUN_STATUSES,
} from "@convex/core/runLifecyclePlan";

export const RUN_STATUS = RUN_LIFECYCLE_STATUS;
export const ACTIVE_STATUSES = ACTIVE_RUN_STATUSES;
export const TERMINAL_STATUSES = TERMINAL_RUN_STATUSES;

// Max records to query+delete per table per batch when deleting a run.
// Each table read counts as 1 + N (index scan + rows returned), and each delete
// is 1 read. With 5 tables: 5 × (1 + 300) queries + 5 × 300 deletes = ~3005,
// safely under Convex's 4096 read limit per transaction.
export const RUN_DELETE_BATCH_SIZE = 300;
