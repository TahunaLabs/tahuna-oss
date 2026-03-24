# Gap Analysis — Specs vs Implementation

Audit date: 2026-03-24  
Repository state audited: local `develop` branch, clean worktree  
Audit focus: contrast the current codebase with the spec set below, and explicitly separate resolved items from live gaps.

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

## Audit method
- Re-read the previous `specs/gap-analysis.md` and treated it as a historical snapshot from 2026-03-11, not as current truth.
- Re-checked the implementation surfaces that the previous audit called out:
  - CLI command surface and UX: `cli/main.go`, `cli/commands_core.go`, `cli/run_ops.go`, `cli/project.go`
  - Convex schema and API contracts: `web/convex/schema.ts`, `web/convex/http.ts`, `web/convex/auth.ts`, `web/convex/cli/*.ts`, `web/convex/environments.ts`, `web/convex/runs.ts`, `web/convex/runsLifecycle.ts`
  - Web dashboard routes and interactions: `web/app/dashboard/page.tsx`, `web/app/dashboard/runs/[id]/page.tsx`, `web/app/machines/page.tsx`
  - Shared config/constants: `web/config.ts`
  - Runtime bootstrap/train contract: `runtime/warden/internal/bootstrap/bootstrap.go`, `runtime/warden/internal/train/train.go`

## Executive summary
- The 2026-03-11 gap analysis is materially stale.
- A large share of the old P0, P1, and P2 items are already implemented.
- The remaining live gaps are now concentrated in:
  - CLI command naming parity (`catalog gpus` vs `gpus list`)
  - Shell UX parity
  - Dashboard destructive-action confirmations
  - A cross-spec naming conflict around legacy provider env aliases
  - P3 roadmap items that are intentionally future-facing

## Status Legend
- `resolved`: implemented in the current codebase; the previous gap is no longer valid.
- `open`: still missing or still diverges from the spec.
- `spec conflict`: code may be internally consistent, but the specs still disagree with each other or with the intended product surface.
- `future`: still unimplemented, but explicitly roadmap/future in the specs rather than a present-day contract break.

## Re-audit of prior claims

### Previously reported P0 items

| Old # | Previous claim | Current status | Current evidence |
|---|---|---|---|
| 1 | Init/bootstrap still anchored on `requirements.txt` instead of uv | `resolved` | Init scaffolds `pyproject.toml` and `uv.lock` in `cli/commands_core.go:68-75`; project config includes uv-era fields in `cli/project.go:34-58`; runtime installs with `uv sync` in `runtime/warden/internal/train/train.go:387-505` |
| 2 | Default run command is `python3 -u train.py` instead of `uv run python -u` | `resolved` | Default command normalizes to `uv run --active --no-sync python -u train.py` in `runtime/warden/internal/train/train.go:695-715` |
| 3 | Project config schema is missing uv/python/framework fields | `resolved` | `projectConfig` and YAML parsing include `python_project_file`, `uv_lock_file`, `framework`, `framework_version`, `python_version` in `cli/project.go:34-79` |
| 4 | DB schema missing `environments.pythonVersion` and `runs.name` | `resolved` | `web/convex/schema.ts:18-39` includes `pythonVersion`, `boundDataManifestHashes`, and `runs.name` |
| 5 | Run lifecycle starts at `provisioning` instead of `queued -> provisioning` | `resolved` | Run rows are inserted with `status: RUN_STATUS.QUEUED` and an initial queued event in `web/convex/runsLifecycle.ts:75-116` |
| 6 | Cancel/delete semantics conflated; `--force` has no backend effect | `resolved` | Cancel path is distinct in `web/convex/runsLifecycle.ts:124-186`; delete path has separate active-run handling and force semantics in `web/convex/runsLifecycle.ts:218-260`; CLI routes cancel via runtime cancel handler and delete via DELETE in `web/convex/cli/runs.ts:11-25,200+` |
| 7 | Dashboard creates environments despite init-only rule | `resolved` | CLI still enforces init-only creation by rejecting `tahuna env create` in `cli/commands_core.go:218-221`; dashboard page uses remove/update/run/data/config mutations but does not expose an environment create mutation in `web/app/dashboard/page.tsx:235-245` |
| 8 | Environment delete does not clean synced/manifests/artifacts in object storage | `resolved` | Environment removal deletes indexed storage rows, run artifact objects, and schedules dedup/object-prefix cleanup in `web/convex/environments.ts:678-767` and `web/convex/environments.ts:896-948` |
| 9 | Sync object key model is not spec-compliant for dedup | `partially resolved / spec needs confirmation` | Blob objects are now globally keyed as `blobs/<sha>` in `web/convex/cli/shared.ts:76-82`; manifests remain environment/data scoped in `web/convex/cli/shared.ts:67-91`; if the spec still requires a different manifest-key model, the spec should say so explicitly |
| 10 | `/sync/commit` requires full manifest payload instead of hash-only commit | `resolved` | `/api/sync/commit` now accepts manifest hashes only, validates uploaded manifest objects, and commits pointers without requiring full manifest payload in `web/convex/cli/sync.ts:315-427` |
| 11 | API key auth does not update `lastUsedAt` | `resolved` | Lookup returns `keyId` and `lastUsedAt` in `web/convex/auth.ts:242-268`; auth requests schedule `internalTouchApiKeyLastUsed` in `web/convex/cli/shared.ts:36-60`; mutation writes `lastUsedAt` in `web/convex/auth.ts:272-293` |
| 12 | Shared constants are not centralized in `web/config.ts` | `resolved, with caveat` | `web/config.ts:1-70` now centralizes network, auth, billing, run, sync, Python, and upload-limit constants. Some CLI-local constants still remain in Go, but the previous claim that the file only held upload limits is no longer true |

### Previously reported P1 items

| Old # | Previous claim | Current status | Current evidence |
|---|---|---|---|
| 13 | `run create --name/-n` missing, and no generated default name | `resolved` | CLI usage and parsing support run names in `cli/commands_core.go:312-315,973-996`; run names are generated/validated in `web/convex/runsLifecycle.ts:64-73` |
| 14 | `run rename` missing | `resolved` | CLI route exists in `cli/main.go:93` and `cli/commands_core.go:285-315`; HTTP rename exists in `web/convex/cli/runs.ts:95-139`; backend rename logic exists in `web/convex/runsLifecycle.ts:273-294` |
| 15 | `run create -d/--detached` missing | `resolved` | CLI supports detached create in `cli/commands_core.go:876-918` and `cli/commands_core.go:1018-1047` |
| 16 | `catalog gpus` missing | `open` | The implemented surface is `tahuna gpus list`, not `tahuna catalog gpus`; see `cli/main.go:91` and `cli/commands_core.go:339-343` |
| 17 | `data list/show` missing | `resolved` | Implemented in `cli/main.go:92` and `cli/commands_core.go:346-459`; HTTP routes exist in `web/convex/http.ts:28-30` |
| 18 | `env data bind/unbind` missing | `resolved` | CLI exists in `cli/main.go:90` and `cli/commands_core.go:328-336,461-520`; schema support exists in `web/convex/schema.ts:22-25`; Convex mutations exist in `web/convex/environments.ts:808-838`; HTTP parsing exists in `web/convex/cli/environments.ts:227-260+` |
| 19 | Local `.tahuna/environment_id` not cleaned on env delete | `resolved` | CLI delete clears the linked environment file after successful deletion in `cli/commands_core.go:776-783` |
| 20 | GPU max-count validation not enforced in init/update/run overrides | `resolved` | Init validates GPU choice in `cli/commands_core.go:160-167`; env update validates limits in `cli/commands_core.go:852-860` and `web/convex/cli/environments.ts:194-220`; run creation validates override counts in `web/convex/cli/runs.ts:58-71` |
| 21 | CLI flags diverge (`-n` for lines instead of `-l`) | `resolved` | Run list usage now documents `-l` for line count in `cli/main.go:99-103` and `cli/commands_core.go:312` |
| 22 | `run show` defaults to raw JSON | `resolved` | `runShow` prints a human summary and only emits full JSON under `--verbose` in `cli/run_ops.go:53-256` |
| 23 | Shell behavior diverges; no history/editing guarantees | `open` | Shell is still a basic `bufio.Reader` loop in `cli/main.go:237+`; no readline/history/editing support is visible in the current implementation |
| 24 | Run creation incorrectly requires data manifest | `resolved` | `createRunForUserId` only requires code manifest; data manifest is optional and stored as `undefined` when absent in `web/convex/runsLifecycle.ts:58-63,89-90`; provisioning logic only fetches data manifest when present in `web/convex/runs.ts:1373-1378` |
| 25 | Provider env alias policy conflict (`CONVEX_*` vs `TAHUNA_*`) | `spec conflict` | CLI docs/environment variables use `TAHUNA_*` aliases in `cli/main.go:116-120`, but the prior spec conflict remains a documentation/policy question rather than an implementation gap |

### Previously reported P2 items

| Old # | Previous claim | Current status | Current evidence |
|---|---|---|---|
| 26 | No `/machines` page | `resolved` | Machines page exists in `web/app/machines/page.tsx:44-189` |
| 27 | No run detail page with real-time logs/metrics/charts | `resolved` | Run detail route exists in `web/app/dashboard/runs/[id]/page.tsx:31-210` |
| 28 | No artifact rename workflow | `resolved` | Dashboard rename flow exists in `web/app/dashboard/page.tsx:650-702`; rename action is wired through `api.storage.renameArtifact` in `web/app/dashboard/page.tsx:266-268` |
| 29 | No environment config-file editor UI | `resolved` | Config editor state, loading, save flow, and mutation wiring exist in `web/app/dashboard/page.tsx:354-376,590-639` |
| 30 | No data-binding UI | `resolved` | Bind/unbind flows exist in `web/app/dashboard/page.tsx:561-588` |
| 31 | Storage is data-only, not unified with run outputs | `resolved` | Dashboard loads storage through `api.storage.list` and supports run artifact rename/visibility/share paths in `web/app/dashboard/page.tsx:266-270,397-441,641-702` |
| 32 | Missing `/login` route parity | `resolved` | App links and redirects now target `/login` in `web/components/header.tsx:52,85`, `web/components/hero.tsx:31`, and `web/app/dashboard/page.tsx:705-712`; `web/app/login/page.tsx` exists |
| 33 | Destructive actions do not require confirmations | `open` | `AlertDialog` is used on the machines page in `web/app/machines/page.tsx:142-174`, but no confirmation dialog is wired for dashboard run/environment deletions in `web/app/dashboard/page.tsx:522-559` |

## Current live gaps

### P1 — Current implementation gaps

| # | Gap | Evidence | Notes |
|---|---|---|---|
| 1 | GPU command naming still differs from `catalog gpus` spec language | `cli/main.go:91`, `cli/commands_core.go:339-343` | Product surface is `tahuna gpus list`; either rename CLI or update specs to accept the current command family |
| 2 | Shell UX still lacks explicit line editing/history parity | `cli/main.go:237+` | Basic REPL loop exists, but not the richer shell interaction implied by the earlier spec text |
| 3 | Dashboard destructive actions still lack confirmation dialogs | `web/app/dashboard/page.tsx:522-559` | This now appears to be the main remaining P2 UX gap from the old dashboard list |
| 4 | Provider-env alias policy is still a cross-spec conflict | `cli/main.go:116-120`, plus `specs/cli-ux.md` vs `specs/manual-review.md` | Resolve in docs before forcing another command/env rename pass |

### P2 — Reclassified nuance

| # | Topic | Status | Why |
|---|---|---|---|
| 5 | Sync manifest/object-key contract | `needs spec clarification` | Code now clearly uses global blob dedup (`blobs/<sha>`) plus environment/data-scoped manifest keys. If the spec still expects a different manifest namespace, the intended contract should be rewritten precisely before changing code |
| 6 | Shared constants centralization | `mostly resolved` | The shared TypeScript app/runtime constants are centralized in `web/config.ts`, but this should not be read as “all constants across Go + TS must live in one file” unless the specs state that explicitly |

## P3 roadmap items

These remain future-facing rather than present-day contract breaks.

| Old # | Feature | Current state | Linear |
|---|---|---|---|
| 34 | Pod network restriction defaults | `future` | `TAH-23` |
| 35 | Pod heartbeat/liveness termination when sync stops | `future / in progress` | `TAH-24` |
| 36 | Chunked/resumable upload | `future` | `TAH-25` |
| 37 | Sync history/rollback commands | `future` | `TAH-26` |
| 38 | Optional no-capacity queue UX | `future` | `TAH-27` |
| 39 | wandb-compatible SDK | `future / in progress` | `TAH-28` |
| 40 | Custom Docker images | `future` | `TAH-29` |
| 41 | Cross-environment data binding | `resolved` | `TAH-30` is already `Done`; remove this from future-gap tracking |
| 42 | `tahuna pull` | `future` | no dedicated issue found in this audit |
| 43 | Per-user artifact size limits | `future` | `TAH-32` |

## Recommended next updates

### Update this document immediately when:
- A spec decision lands on `catalog gpus` versus `gpus list`
- The shell UX is either upgraded or the spec is reduced to match the current simple REPL
- Dashboard delete/cancel confirmations are added
- The provider-env alias policy is resolved in the specs

### Remove from future audits entirely unless they regress:
- uv migration
- run queued lifecycle start
- schema fields `pythonVersion`, `boundDataManifestHashes`, `runs.name`
- hash-only `/sync/commit`
- API key `lastUsedAt` updates
- machines page
- run detail page
- artifact rename
- environment config editor
- data binding UI
- unified storage surface

## Net conclusion
- The previous 2026-03-11 audit should be treated as historical context only.
- The current implementation is much closer to the specs than that document indicates.
- The remaining meaningful work is no longer broad feature parity; it is mostly command naming, confirmation UX, shell UX, and a few unresolved spec-policy decisions.
