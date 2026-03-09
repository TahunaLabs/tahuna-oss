# Control Plane

Last updated: 2026-03-09

## Purpose
The control plane is the source of truth for auth, run lifecycle, sync pointers, runtime telemetry, and artifact metadata.

## Implemented Responsibilities
- API key auth for CLI/web requests.
- Runtime token auth for pod runtime callbacks.
- Environment + run CRUD.
- Strict run creation with immediate provisioning attempt.
- Sync pointer commit (`latestCodeManifestHash`, `latestDataManifestHash`).
- Runtime log/metric/status ingestion.

## Current Data Model
- `environments`
  - `dataId`
  - `latestCodeManifestHash`
  - `latestDataManifestHash`
  - `latestSyncAt`
- `runs`
  - `effectiveGpuType`, `effectiveGpuCount`, `effectiveVolumeGb`
  - `codeManifestHash`, `dataManifestHash`
  - `runtimeTokenHash`
  - `podId`, `status`, `error`
- `runEvents`
  - status/event timeline
- `runRuntimeLogs`
  - runtime log lines
- `runRuntimeMetrics`
  - runtime metric samples

## Current HTTP Surface
- `GET /api/health`
- `GET /api/catalog`
- `POST /api/sync/blobs/missing`
- `POST /api/sync/blobs/upload-url`
- `POST /api/sync/manifests/upload-url`
- `POST /api/sync/commit`
- `POST /api/sync/metadata`
- `GET|POST /api/environments`
- `GET|PATCH|DELETE /api/environments/{env_id}`
- `POST /api/environments/{env_id}/runs`
- `GET|POST /api/runs`
- `GET|DELETE /api/runs/{run_id}`
- `GET /api/runs/{run_id}/logs`
- `GET /api/runs/{run_id}/runtime/bootstrap`
- `POST /api/runs/{run_id}/runtime/logs`
- `POST /api/runs/{run_id}/runtime/metrics`
- `POST /api/runs/{run_id}/runtime/status`

## Current Run State Semantics
- `queued -> provisioning -> running -> completed`
- `queued|provisioning|running -> failed`
- `queued|provisioning|running -> cancelling -> cancelled`

## Known Gaps
- No generic run-attempt model yet.
- No provider-neutral scheduler/executor interface yet.
- No checkpoint lineage tables yet.
