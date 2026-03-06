# Tahuna Project Context

Last updated: 2026-03-06

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
- `[~]` `tahuna init` exists and launches guided flow (`cli/main.go`)
- `[ ]` project path selection (`.` or empty) not implemented
- `[ ]` new repo creation (`npx create-next`) not implemented
- `[x]` framework/version selection exists in CLI prompts
- `[ ]` framework persistence for future provisioning is not explicit beyond environment records
- `[ ]` data directory configuration in CLI not implemented
- `[ ]` `config.yml` generation/management not implemented
- `[x]` environment creation flow exists (CLI + Convex `environments`)

Run:
- `[~]` CLI supports interactive shell mode (`tahuna shell`) and run lifecycle commands
- `[ ]` local directory data sync from CLI not implemented
- `[~]` data upload exists in dashboard (`web/app/dashboard/page.tsx`, `web/convex/data.ts`)
- `[ ]` codebase sync (Convex-style) not implemented in CLI
- `[ ]` env var sync (Convex-style) not implemented in CLI
- `[ ]` `train` / `train -d` command model not implemented (current model is `run create/watch/show/logs`)
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

Remaining operational note:
- CLI still defaults to `TAHUNA_API_URL=http://localhost:3000`, which assumes a host exposing the Convex HTTP API at `/api/*`.

## 5) What Does What (Code Map)

### CLI (`/cli`)

- [`cli/main.go`](/Users/pazuzzu/Desktop/gigi/boob-ai/cli/main.go)
  - command entrypoint and parsing
  - browser-based login (`tahuna login`) with local callback
  - guided setup (`init`)
  - interactive shell mode (`shell`)
  - environment commands: `create/list/show/delete`
  - run commands: `create/list/show/watch/logs/delete`
  - HTTP client (`doJSON`) with `TAHUNA_API_URL` + `TAHUNA_API_KEY`

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
4. CLI stores auth token in `.env.local` (current CLI working directory).
5. Use CLI + dashboard to create environments, upload data, and run jobs.

## 7) Suggested Next Milestone (to unblock CLI-first phase)

If we prioritize your stated unblock (CLI flow first), the shortest path is:

1. Implement `train` command layer as an opinionated wrapper around run create/watch.
2. Add local project bootstrap pieces (`tahuna init` repo/data/config flow).
3. Add state file in project root (`.tahuna/` or `tahuna.yml`) to persist framework/data defaults.
4. Implement sync commands for data/code/env vars from CLI.

---

This file is intended as the onboarding entrypoint for new LLM sessions and contributors before touching code.
