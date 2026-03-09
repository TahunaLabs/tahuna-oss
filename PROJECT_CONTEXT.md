# Tahuna Project Context

Last updated: 2026-03-09

## 1) What This Project Is

Tahuna is a GPU provisioning + training orchestration product for data scientists.

Current codebase architecture:

- `cli/`: Go CLI for user workflows (`tahuna init`, env/run commands, interactive shell).
- `web/`: Next.js app for auth, dashboard, API key management, and Convex-backed backend logic.
- `web/convex/*`: backend state, APIs, and run lifecycle logic.

The intended user story is:

1. Set up project and environment quickly.
2. Sync code/data/config.
3. Launch and monitor training runs from CLI/dashboard.

## 2) High-Level User Workflows (Target)

### Workflow 1 (new/local project)

Setup target:
- `tahuna init`
- Pick current project (`.`) or create a new repo (`create-next` path)
- Configure framework (saved for future provisioning)
- Configure data directory
- Configure `config.yml` (hyperparameters)
- Create env

Run target:
- Interactive CLI
- Sync data with local dir (with large-data strategy)
- Sync codebase (Convex-style)
- Sync env vars (Convex-style)
- Run commands: `train`, `train -d`, config overrides, `show`, etc
- Live terminal metrics/loss (future OneDB integration)
- Static top area (logo/status/monitoring) + interactive command area

### Workflow 2 (existing repo)

Setup target:
- Connect git repo
- Select machine + default machine
- Detect framework from repo (or manual selection)
- Create env

Run target:
- Create new run from existing environment + data
- Dashboard monitoring

## 3) Current Implementation Status

Legend:
- `[x]` implemented
- `[~]` partially implemented
- `[ ]` not implemented yet

### Workflow 1 status

Setup:
- `[~]` `tahuna init` supports `init .` and `init <project-name>` with guided environment creation + project env linking
- `[x]` project path selection (`.`) implemented
- `[~]` new project directory creation implemented (full repo bootstrap like `npx create-next` still pending)
- `[x]` project file detection/selection prompts in `init` (entrypoint/data/config/requirements) with default creation paths
- `[x]` framework detection prompt in `init` (auto-detect from config/requirements with fallback prompt)
- `[x]` framework/version selection exists in CLI prompts
- `[ ]` framework persistence for future provisioning is not explicit beyond environment records
- `[x]` data directory configuration in CLI `init` implemented
- `[x]` config/requirements/entrypoint generation in CLI `init` implemented (basic templates)
- `[x]` environment creation flow exists (CLI + Convex `environments`)

Run:
- `[~]` CLI supports interactive shell mode (`tahuna shell`) and run lifecycle commands
- `[x]` local directory data sync from CLI to R2 implemented as incremental manifest/blob sync + automatic pre-run sync (`train`, `run create`)
- `[~]` data upload exists in dashboard (`web/app/dashboard/page.tsx`, `web/convex/data.ts`)
- `[x]` codebase sync from CLI to R2 implemented as incremental manifest/blob sync + automatic pre-run sync (`train`, `run create`)
- `[x]` manual sync command implemented (`tahuna sync`, `tahuna sync code`, `tahuna sync data`)
- `[ ]` env var sync (Convex-style) not implemented in CLI
- `[x]` `train` / `train -d` command model implemented with optional runtime overrides (`--gpu-type`, `--gpu-count`, `--volume-gb`)
- `[x]` run listing/show/watch/logs/delete exist
- `[ ]` live loss/metrics stream not implemented
- `[~]` terminal UI includes branded panels and status, but not full split static+interactive dashboard behavior

### Workflow 2 status

Setup:
- `[ ]` git connection flow not implemented
- `[~]` machine/GPU selection exists during environment creation (CLI prompt + dashboard selector)
- `[ ]` default machine selection not implemented
- `[ ]` framework auto-detection from repo not implemented
- `[x]` environment creation is implemented

Run:
- `[x]` create run from existing environment implemented
- `[~]` dashboard monitoring exists with run status lists; deep run observability is limited

## 4) API Contract Status (CLI <-> Convex)

Contract fixes applied on 2026-03-06:

1. CLI path prefix compatibility fixed.
   - CLI now auto-prefixes requests with `/api`.
   - If `TAHUNA_API_URL` already ends with `/api`, CLI avoids double-prefixing.

2. Environment endpoint compatibility fixed.
   - Added `GET /api/environments/{env_id}`.
   - Added `POST /api/environments/{env_id}/runs`.

3. Catalog payload compatibility fixed.
   - `/api/catalog` now returns both `images` and `gpus`.
   - GPU list uses dynamic Runpod data when available, with a fallback value.

Current operational note:
- CLI API URL resolution order is: `TAHUNA_API_URL` -> `CONVEX_SITE_URL` -> `NEXT_PUBLIC_CONVEX_SITE_URL` -> default `http://localhost:3000`.
- CLI browser login URL can be explicitly set with `TAHUNA_BROWSER_URL`; if missing, CLI auto-detects a working browser base and persists it.
- CLI auth token is read from env vars or global config file `~/.config/tahuna/config.env`.

## 5) What Does What (Code Map)

### CLI (`/cli`)

- [`cli/main.go`](/Users/pazuzzu/Desktop/gigi/boob-ai/cli/main.go)
  - command entrypoint and parsing
  - browser-based login (`tahuna login`) with local callback and automatic browser URL persistence (`TAHUNA_BROWSER_URL`)
  - guided setup (`init`) with local project file prompts/scaffolding
  - interactive shell mode (`shell`)
  - environment commands: `list/show/delete` (`create` intentionally removed; creation via `init`)
  - train commands: `train`, `train -d` with optional overrides
  - run commands: `create/list/show/watch/logs/delete` (`run create` uses linked `.tahuna/environment_id`, no `--environment-id`)
  - HTTP client (`doJSON`) with standalone config resolution (`~/.config/tahuna/config.env` + env vars)

### Web App (`/web`)

- [`web/app/dashboard/page.tsx`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/app/dashboard/page.tsx)
  - authenticated dashboard UI
  - create/delete environments
  - create/cancel runs
  - upload/remove data blobs

- [`web/app/api-key/page.tsx`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/app/api-key/page.tsx)
  - create/revoke API keys (legacy/manual path, still available)

- [`web/app/auth/cli/page.tsx`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/app/auth/cli/page.tsx)
  - browser authorization step for CLI login callback flow

### Convex Backend (`/web/convex`)

- [`web/convex/schema.ts`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/schema.ts)
  - tables: `apiKeys`, `environments`, `runs`, `runEvents`

- [`web/convex/http.ts`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/http.ts)
  - HTTP route registration for CLI-style API

- [`web/convex/cli.ts`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/cli.ts)
  - HTTP handlers for health/catalog/environments/runs
  - API key authentication

- [`web/convex/environments.ts`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/environments.ts)
  - environment CRUD and validation

- [`web/convex/runs.ts`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/runs.ts)
  - run CRUD + lifecycle events
  - simulated provisioning flow (`queued -> running -> completed/cancelled`)

- [`web/convex/data.ts`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/data.ts)
  - R2 data upload URLs, metadata sync, listing, deletion

- [`web/convex/auth.ts`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/auth.ts)
  - Better Auth integration
  - API key creation/validation

## 6) Current Working Flow (Today)

Most realistic current path:

1. Run web + Convex locally.
2. Run `tahuna login` from CLI.
3. Browser opens auth flow and redirects back to local CLI callback.
4. CLI stores auth token (and auto-detected browser URL base when missing) in `~/.config/tahuna/config.env`.
5. Use `tahuna init .` (or `tahuna init <project-name>`) then `tahuna train` / `tahuna train -d`.
6. Use CLI + dashboard to inspect runs/data.

## 7) Product Decisions (locked 2026-03-09)

The following sync architecture choices are now agreed and should be treated as implementation constraints:

1. Upload timing:
   - `tahuna train` and `tahuna run create` must always run a preflight sync.
   - Manual sync command(s) are required (`tahuna sync ...`) for explicit user-triggered sync.
   - No upload-on-every-file-save behavior.

2. Upload payload model:
   - Move from "always upload fresh tarball" to a git-style incremental strategy.
   - Use content hashes + manifest comparison so only changed blobs are uploaded.
   - Avoid re-implementing full Git internals (packfiles, delta compression, object graph GC).

3. Upload destination:
   - R2 is the source of truth for synced code/data artifacts.
   - Pods pull by version/manifest pointer at run startup.
   - Direct client-to-pod upload is not the primary path.

## 8) Next Milestone (Incremental Sync (0.1.0))

Milestone objective: deliver incremental, reproducible sync with R2-backed manifests and blob deduplication.

1. Add explicit manual sync commands (`tahuna sync`, `tahuna sync code`, `tahuna sync data`).
2. Implement content-addressed blob uploads and manifest-based diffing.
3. Store artifact/data manifest pointers and pin them on each run.
4. Update run provisioning contract so pod startup fetches by manifest pointer from R2.
5. Keep env var sync/injection and richer run observability as follow-on work after Incremental Sync (0.1.0) base is stable.

Progress (2026-03-09):
- `[x]` Single incremental sync engine in CLI core path (`sync`, `train`, `run create`) with no tarball fallback path.
- `[x]` Backend sync endpoints for missing blobs/upload URL/manifest upload URL/commit.
- `[x]` Backend commit validates manifest hash format and manifest payload schema (`version/type/created_at/entries`, sorted paths, sha/mode/size checks).
- `[x]` Run creation pins environment manifest hashes and now fails clearly when environment was not synced.
- `[~]` Pod runtime remains simulated; provisioning payload contract is pinned and explicit, but real pod fetch/extract implementation is still pending.

Pod startup contract detail (Incremental Sync (0.1.0)):
- Run creation pins `codeManifestHash` / `dataManifestHash` from environment latest pointers when available.
- Provisioning payload includes pinned hashes plus resolved manifest keys:
  - `<userId>/manifests/code/<codeManifestHash>.json`
  - `<userId>/manifests/data/<dataManifestHash>.json`
- Pod must reconstruct workspace/data exclusively from these pinned manifests to guarantee reproducibility across later syncs.

Update (completed 2026-03-06):
- `tahuna init .` initializes current project, and `tahuna init <project-name>` creates/selects a project directory, then links created environment to `.tahuna/environment_id`.
- `tahuna init` now collects local project setup inputs first (entrypoint/data/config/requirements), auto-detects framework when possible, then prompts machine/runtime settings.
- `tahuna train` requires a linked `.tahuna/environment_id` from `init`, creates a run through existing `/api/environments/{env_id}/runs`, prints concise summary, and monitors in foreground.
- `tahuna train -d` creates a run and exits immediately after summary output.
- `tahuna train` and `tahuna run create` now auto-sync before run creation:
  - code archive -> environment artifacts path in R2
  - project data directory -> data path in R2
  - run creation payload remains minimal (runtime overrides only), with no code/data embedding.
- `tahuna` with no args now shows usage/help (no implicit `init .`).
- `tahuna run create` now uses linked project environment automatically (no `--environment-id` flag).
- `tahuna login` now auto-detects/persists `TAHUNA_BROWSER_URL` in CLI config when missing.

Clarification (agreed direction):
- Code/data sync must happen via R2 before run launch, not inside run creation payload fields.
- This pre-run sync should run automatically on run creation paths.
- Sync architecture direction (2026-03-09):
  - Add manual sync command(s) in addition to mandatory run preflight sync.
  - Use incremental manifest/hash uploads, not full archive upload on every sync.
  - Keep R2 as canonical storage; pods fetch by pinned sync version/manifest.

---

This file is intended as the onboarding entrypoint for new LLM sessions and contributors before touching code.
