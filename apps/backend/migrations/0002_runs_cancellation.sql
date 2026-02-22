ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS cancellation_requested BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_runs_task_id ON runs(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_cancellation_requested ON runs(cancellation_requested);
