# Gap Analysis — Specs vs Implementation

Audit date: 2026-03-11  
Audited code: `cli/main.go`, `web/convex/*`, `web/app/*`, `web/config.ts`, `cli` tests

## Scope reviewed
- `specs/auth.md`
- `specs/init.md`
- `specs/environments.md`
- `specs/sync.md`
- `specs/run-lifecycle.md`
- `specs/pod-bootstrap.md`
- `specs/dashboard.md`
- `specs/cli-ux.md`
- `specs/manual-review.md`

## Contrast vs Claude Findings
### Confirmed
- UV migration is incomplete end-to-end (init, project config, bootstrap command/deps).
- `project.yaml`/project config is missing uv-era fields.
- `environments` schema is missing `pythonVersion`.
- `runs` schema is missing `name`.
- `web/config.ts` is missing most shared constants (only upload limits exist).
- Core CLI features are missing (`run rename`, `run create --name`, `run create -d`, `catalog gpus`, `data list/show`, `env data bind/unbind`).
- Dashboard parity gaps are real (machines page, run detail/streaming, config editor, data binding, artifact rename, unified storage).
- `lastUsedAt` is not updated on API key auth.

### Added by this audit (not in Claude summary, but contract-level)
- Run creation skips `queued` and starts directly at `provisioning` (`web/convex/runs.ts:1295`).
- `run cancel` and `run delete` both call the same delete endpoint; `--force` currently changes only prompt text (`cli/main.go:2563`, `web/convex/runs.ts:1327`).
- Dashboard can create environments, but spec says `tahuna init` is the only creation path (`web/app/dashboard/page.tsx:275`, `web/convex/environments.ts:227`).
- Environment delete does not delete synced/manifests/artifacts in object storage (`web/convex/environments.ts:162` with no R2 cleanup).
- Sync blob key contract differs from spec dedup model (env-scoped code blob keys, not `<user>/blobs/<sha>`; `web/convex/cli.ts:72`).
- `/sync/commit` requires full manifest payload, while spec contract says hash commit after upload (`web/convex/cli.ts:676`).
- Run creation incorrectly requires both code and data manifests (spec allows optional data) (`web/convex/runs.ts:1283`).

### Re-prioritized nuance
- `CONVEX_SITE_URL` naming: `cli-ux.md` currently allows legacy provider aliases for migration, while `manual-review.md` asks to remove provider naming. This is a cross-spec conflict and should be resolved explicitly; treated below as P1 doc/code alignment, not P0 runtime breakage.

## Priority Matrix

### P0 — Broken Contracts (must-fix first)

| # | Gap | Evidence | Why P0 |
|---|-----|----------|--------|
| 1 | Init/bootstrap still anchored on `requirements.txt` instead of uv contract (`pyproject.toml` + `uv.lock`, `uv sync`) | `cli/main.go:2633`, `cli/main.go:2733`, `web/convex/runs.ts:774`, `web/convex/runs.ts:783` | Core runtime reproducibility contract is wrong |
| 2 | Default run command is `python3 -u train.py` instead of `uv run python -u` | `web/convex/runs.ts:742` | Pod runtime does not honor spec execution contract |
| 3 | Project config schema is missing uv/python/framework fields | `cli/main.go:2619`, `cli/main.go:2805` | Spec-defined local source of truth is incomplete |
| 4 | DB schema gaps: `environments.pythonVersion` and `runs.name` missing | `web/convex/schema.ts:20`, `web/convex/schema.ts:35` | Required persisted fields absent |
| 5 | Run lifecycle starts in `provisioning`, not `queued -> provisioning` | `web/convex/runs.ts:1295` | State machine contract violated |
| 6 | Cancel/delete semantics are conflated; `--force` has no backend effect | `cli/main.go:2563`, `web/convex/runs.ts:1327` | CLI/API behavior deviates from cancel contract |
| 7 | Dashboard creates environments, contrary to init-only creation rule | `web/app/dashboard/page.tsx:275`, `web/convex/environments.ts:227` | Ownership boundary from spec is broken |
| 8 | Environment cascade delete does not remove synced objects/manifests/artifacts from object storage | `web/convex/environments.ts:162` | Leaves remote orphaned state |
| 9 | Sync object key model is not spec-compliant for global blob dedup | `web/convex/cli.ts:72`, `web/convex/cli.ts:86` | Repro/dedup model contract mismatch |
| 10 | `/sync/commit` requires manifest payload, not hash-only commit contract | `web/convex/cli.ts:676`, `web/convex/cli.ts:681` | External clients implementing spec will fail |
| 11 | API key auth does not update `lastUsedAt` | `web/convex/auth.ts:133` | Auth identity lifecycle incomplete |
| 12 | Shared constants are not centralized in `web/config.ts` | `web/config.ts:1`, hardcoded values in `cli/main.go:221`, `cli/main.go:1161`, `web/convex/auth.ts:59`, `web/convex/runs.ts:843` | Spec-defined config source-of-truth missing |

### P1 — Missing Core Features / Behavioral Gaps

| # | Gap | Evidence |
|---|-----|----------|
| 13 | `run create --name/-n` missing, and no random word-based default name | `cli/main.go:913`, `web/convex/schema.ts:35` |
| 14 | `run rename` command missing | `cli/main.go:546` |
| 15 | `run create -d/--detached` missing (exists only on `train`) | `cli/main.go:913`, `cli/main.go:950` |
| 16 | `catalog gpus` CLI command missing | `cli/main.go:65` (no `catalog` route) |
| 17 | `data list/show` CLI commands missing | `cli/main.go:65` (no `data` route) |
| 18 | `env data bind/unbind` missing (CLI + API + schema support) | `cli/main.go:524`, `web/convex/http.ts:39`, `web/convex/schema.ts:20` |
| 19 | Local `.tahuna/environment_id` is not cleaned on env delete | `cli/main.go:831` |
| 20 | GPU max-count validation is not enforced in init/update/run overrides | `cli/main.go:902`, `web/convex/environments.ts:140`, `web/convex/runs.ts:1297` |
| 21 | CLI flag conventions diverge (`-n` used for lines; spec says `-l`) | `cli/main.go:2191`, `cli/main.go:2351` |
| 22 | `run show` default output is raw JSON, not human summary UX | `cli/main.go:2221` |
| 23 | Shell behavior diverges (allows `init/login`, no line history/editing guarantees) | `cli/main.go:257` |
| 24 | Run creation currently requires data manifest instead of optional data manifest | `web/convex/runs.ts:1283` |
| 25 | Spec conflict: provider env aliases (`CONVEX_*`) vs manual-review naming guidance | `cli/main.go:372`, `web/lib/auth-server.ts:3`, `specs/cli-ux.md`, `specs/manual-review.md` |

### P2 — Dashboard / Web Parity Gaps

| # | Gap | Evidence |
|---|-----|----------|
| 26 | No `/machines` page; `/api-key` just redirects | `find web/app ...`, `web/app/api-key/page.tsx:3` |
| 27 | No run detail page with real-time logs/metrics and charts | `web/app/dashboard/page.tsx:646`, no `/dashboard/runs/[id]` route |
| 28 | No artifact rename workflow | no rename route/mutation in `web/convex/*` and no UI action in `web/app/dashboard/page.tsx` |
| 29 | No environment config-file editor UI | `web/app/dashboard/page.tsx` environment form has only name/spec fields |
| 30 | No data-binding UI for attaching existing datasets to environments | `web/app/dashboard/page.tsx` |
| 31 | Storage section is data-upload list only; run output artifacts are not a unified storage surface | `web/app/dashboard/page.tsx:439`, `web/app/dashboard/page.tsx:646` |
| 32 | Missing `/login` route name parity (current route is `/auth`) | `web/app/dashboard/layout.tsx:11`, app routes list |
| 33 | Destructive actions do not require confirmation dialogs | `web/app/dashboard/page.tsx:339`, `web/app/dashboard/page.tsx:353` |

### P3 — Future Features (explicitly future in specs)

| # | Feature | Current state |
|---|---------|---------------|
| 34 | Pod network restriction defaults | Missing |
| 35 | Pod heartbeat/liveness termination when sync stops | Missing |
| 36 | Chunked/resumable upload | Missing |
| 37 | Sync history/rollback commands | Missing |
| 38 | Optional no-capacity queue UX | Missing (workpool exists, no user queue UX) |
| 39 | wandb-compatible SDK | Missing |
| 40 | Custom Docker images | Missing |
| 41 | Cross-environment data binding | Missing |
| 42 | `tahuna pull` | Missing |
| 43 | Per-user artifact size limits | Missing |

## Action Plan (Execution Order)

### Phase 1 — Close P0 contract breaks
1. Complete uv migration:
   - Init scaffolds `pyproject.toml` + `uv.lock`.
   - Framework/python detection from uv files only.
   - Bootstrap installs via `uv sync` and runs via `uv run python -u`.
2. Schema and API contract corrections:
   - Add `environments.pythonVersion`, `environments.boundDataManifestHashes`, `runs.name`.
   - Start runs in `queued`; enforce valid transitions.
   - Separate cancel vs delete semantics and make `--force` effective server-side.
3. Sync contract corrections:
   - Align blob/manifests key model to spec (or revise spec explicitly if env-scoped keys are intentional).
   - Make `/sync/commit` accept hash-only commit payload per spec.
4. Environment deletion correctness:
   - Add R2 cleanup for manifests/blobs/run artifacts on cascade delete.
5. Auth lifecycle:
   - Update `lastUsedAt` on successful API key validation.
6. Shared constants:
   - Centralize all auth/sync/run/bootstrap constants in `web/config.ts` and consume consistently.

### Phase 2 — Core CLI parity (P1)
1. Add run naming (`--name`, random word-based default, `run rename`).
2. Add `run create -d`.
3. Add missing commands: `catalog gpus`, `data list/show`, `env data bind/unbind`.
4. Enforce GPU max validation across init/env update/run create.
5. Fix flag conventions (`-l` lines, `-n` name) and `run show` default UX.
6. Delete cleanup of local environment link file.
7. Resolve provider-env naming policy conflict between `cli-ux.md` and `manual-review.md`.

### P1 Dispatch (2026-03-11)
- `COMPLETED (IMPLEMENTED)` — P1-RUN-PARITY-01
  - Scope: #13, #14, #15 from the matrix
  - Deliverables:
    - `tahuna run create --name/-n`
    - default word-based run name when omitted
    - `tahuna run rename <id|name> --name <new-name>`
    - `tahuna run create -d/--detached`
  - Owner: Codex session
  - Linear: `TAH-5`
- `COMPLETED (IMPLEMENTED)` — P1-COMMAND-SURFACE-02
  - Scope: #16, #17, #18 from the matrix
  - Linear: `TAH-6`
- `COMPLETED (IMPLEMENTED)` — P1-UX-VALIDATION-03
  - Scope: #19, #20, #21, #22, #23, #24, #25 from the matrix
  - Linear: `TAH-7`
- `FOLLOW-UP` — P1-SHELL-UX-08
  - Scope: shell line editing/history parity improvements split from #23
  - Linear: `TAH-8` (closed)

### Phase 3 — Dashboard parity (P2)
1. Add `/machines` session management page.
2. Add run detail route with streaming logs/metrics + charts.
3. Add artifact management parity (rename + run-output browsing).
4. Add environment config editor and data-binding UI.
5. Build unified storage surface for data + run outputs.
6. Add confirmation dialogs for destructive actions.
7. Align auth route naming/theme policy (`/login` vs `/auth` decision).

### Phase 4 — Future roadmap (P3)
1. Networking, heartbeat, queue, rollback/history, multipart upload.
2. wandb SDK, custom images, cross-env bindings, `tahuna pull`, per-user limits.

## Verification notes
- CLI tests currently pass in this environment: `go test ./...` from `cli/`.
- Passing tests do not currently cover most missing spec contracts above (naming, uv contract, dashboard parity, delete semantics, storage cleanup).
