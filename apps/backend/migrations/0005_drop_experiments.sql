-- Drop the experiments layer: runs now reference environments directly.

-- Remove experiment FK and column from runs
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_experiment_id_fkey;
ALTER TABLE runs DROP COLUMN IF EXISTS experiment_id;

-- Drop experiment-related indexes
DROP INDEX IF EXISTS idx_runs_experiment;
DROP INDEX IF EXISTS idx_exp_user_created;

-- Drop experiments table (also removes FK constraint from environments)
DROP TABLE IF EXISTS experiments;
