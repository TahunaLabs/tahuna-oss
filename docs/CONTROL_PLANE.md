# Control Plane

## Purpose
The control plane is the system of record for authentication, run lifecycle, queueing, metadata, and artifact indexing. In this repo, it maps to the current web + Convex backend.

## Scope
- User auth and API keys.
- Run creation, cancellation, and status transitions.
- Queue + lease management for executors.
- Metadata for environments, dataset snapshots, runs, attempts, and checkpoints.
- Artifact index (where outputs/checkpoints/logs live in object storage).

## Responsibilities
- Validate and persist an immutable `RunSpec` at run creation time.
- Expose API endpoints for CLI/dashboard + executor callbacks.
- Coordinate retries through run attempts.
- Track checkpoint lineage (`latest`, `best`, `committed`).
- Emit run events for observability (queued, running, failed, completed, cancelled).

## Recommended Data Model
- `runs`
  - `run_id`, `user_id`, `project_id`, `environment_id`
  - `status` (`queued`, `provisioning`, `running`, `succeeded`, `failed`, `cancelled`)
  - `active_attempt`, `max_attempts`
  - `run_spec` (immutable JSON)
  - `created_at`, `updated_at`
- `run_attempts`
  - `attempt_id`, `run_id`, `provider`, `provider_job_id`
  - `status`, `node_count`, `gpus_per_node`
  - `started_at`, `ended_at`, `failure_reason`
- `checkpoints`
  - `run_id`, `attempt_id`, `step`, `epoch`
  - `uri`, `state` (`pending`, `committed`)
  - `metric_primary`, `created_at`
- `artifacts`
  - `run_id`, `kind` (`logs`, `model`, `metrics`, `profile`)
  - `uri`, `content_type`, `size_bytes`, `created_at`
- `run_events`
  - `run_id`, `attempt_id`, `type`, `message`, `payload`, `ts`

## API Contract (Minimal)
- `POST /runs`
  - Create run, persist immutable `RunSpec`, status `queued`.
- `POST /runs/{run_id}/cancel`
  - Request cancellation.
- `POST /runs/{run_id}/lease`
  - Executor lease for queued runs.
- `POST /runs/{run_id}/attempts/{attempt_id}/heartbeat`
  - Worker/executor heartbeat.
- `POST /runs/{run_id}/attempts/{attempt_id}/status`
  - Provider status callback.
- `POST /runs/{run_id}/attempts/{attempt_id}/checkpoints`
  - Register checkpoint pending/committed.
- `POST /runs/{run_id}/attempts/{attempt_id}/logs`
  - Register log chunk/object metadata.

## Run State Machine
- `queued -> provisioning -> running -> succeeded`
- `queued -> provisioning -> failed`
- `running -> failed` (with retry if attempts remain)
- `running -> cancelled`
- `provisioning -> cancelled`

## Non-Goals
- No training framework logic in control plane.
- No provider-specific scheduling logic in control plane.
- No dependency on persistent node volumes.
