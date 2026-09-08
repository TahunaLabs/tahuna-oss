# Runtime Bootstrap

Last reviewed: 2026-05-07

## Current Behavior

Runtime machines run the Go `warden` binary. Warden supports two modes, selected by env vars:

- run mode: `TAHUNA_RUN_ID`
- serve mode: `TAHUNA_SERVE_ID`

Exactly one target id must be present. Shared env vars include:

- `TAHUNA_API_BASE`
- `TAHUNA_RUNTIME_TOKEN`
- `TAHUNA_WORKSPACE_ROOT`, default `/workspace`
- `TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS`, default `120`
- `TAHUNA_CANCELLATION_GRACE_SECONDS`, default `30`

## Training Bootstrap

Warden:

1. Emits provisioning status.
2. Fetches the run bootstrap plan.
3. Materializes code into the workspace.
4. Materializes data into the workspace data path, extracting the deterministic data bundle when present.
5. Installs dependencies with `uv` for the selected dependency group.
6. Emits materialization logs and metrics.
7. Marks the run `running`.
8. Runs the configured command.
9. Uploads output artifacts from the configured output dir.
10. Emits `completed`, `failed`, or `cancelled`.

## Serve Bootstrap

Serve mode fetches a serve bootstrap plan, materializes code, data, and the pinned model snapshot, installs dependencies, then starts the configured inference command. It supervises the process and reports serve status through runtime callbacks.

## Workspace

- Code is materialized under the workspace root.
- Data is materialized under the configured data path.
- Outputs are written under the configured output dir.
- Serve model snapshots are materialized under the backend-provided model root.

## Invariants

- Bootstrap plans contain signed download URLs for already pinned manifests.
- Warden refreshes bootstrap entries if signed URLs need replacement.
- Runtime failures are reported to the backend before Warden exits.
