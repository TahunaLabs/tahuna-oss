# Source-Of-Truth Notes

Last reviewed: 2026-05-07

## Current State

This file used to be a remediation plan. It now records the current source-of-truth boundaries that matter for keeping docs aligned with the codebase.

## Canonical Sources

- CLI command surface: `cli/main.go`, `cli/commands_core.go`, `cli/run_ops.go`, `cli/serve_ops.go`.
- Project config: `cli/project.go`.
- Sync manifest shape and upload flow: `cli/sync.go`, `web/convex/cli/sync.ts`, `web/convex/syncManifest.ts`.
- Storage keys: `web/convex/core/storage.ts`.
- Run lifecycle: `web/convex/core/runLifecyclePlan.ts`, `web/convex/runsLifecycle.ts`.
- Serve lifecycle: `web/convex/core/serveLifecyclePlan.ts`, `web/convex/servesLifecycle.ts`.
- Runtime bootstrap: `runtime/warden/internal/bootstrap`.
- Shared limits and defaults: `web/config.ts`.

## Current Patterns

- Backend client errors use JSON `{ "detail": "..." }`.
- Runtime and CLI contracts use `TAHUNA_*` names.
- Sync is manifest-pinned and content-addressed.
- Warden executes configured command arrays; it does not infer entrypoints at runtime.
- Runtime image and GPU compatibility are resolved before provisioning.

## Invariants

- Keep one canonical helper for storage keys.
- Keep lifecycle status names synchronized across CLI, dashboard, backend, and runtime.
- Keep specs descriptive. Do not add PR plans here.
