# tahuna

GPU provisioning platform for ML training. The architecture is now:
- `web`: Next.js + Convex (UI + backend API)
- `cli`: standalone Go CLI for end users

Start here for project onboarding and workflow status:
- [`PROJECT_CONTEXT.md`](/Users/pazuzzu/Desktop/gigi/boob-ai/PROJECT_CONTEXT.md)

## Current Status (2026-03-06)

Implemented now:
- CLI/browser auth flow via `tahuna login` (no manual dashboard key copy required)
- CLI + backend API contract alignment under `/api/*`
- Environment init/list/show/delete + run lifecycle flows (CLI and dashboard)
- First-class training UX via `tahuna train` and `tahuna train -d`
- Project-linked initialization via `tahuna init .` and `tahuna init <project-name>`
- Data blob upload/list/remove in dashboard

Still pending:
- Full `tahuna init` bootstrap (`.`/new project, data dir, `config.yml`)
- Local project state file (`.tahuna/` or `tahuna.yml`) for defaults
- CLI sync commands (code/data/env vars)
- Git-connect/default machine/framework auto-detection workflow
- Rich live metrics/log streaming and deeper monitoring UI

## Structure

```
├── web/              # Next.js app + Convex backend
├── cli/              # Go CLI (standalone distribution)
├── libs/
├── proto/
└── infra/
```

## Getting Started

Install everything:

```bash
make install
```

Run web app:

```bash
make run-web
```

Run only Next.js (without Convex dev):

```bash
make run-web-app
```

Run CLI:

```bash
make run-cli
```

## Web (Next.js + Convex)

```bash
cd web
bun install
bun run convex:dev
bun run dev
```

Required env vars are in [`web/.env.example`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/.env.example).

## CLI

```bash
cd cli
go mod download
go run .
```

### Homebrew release automation

Tagging a release (`vX.Y.Z`) triggers `.github/workflows/release-cli.yml` with GoReleaser (`.goreleaser.yml`) to:
- build `tahuna` tarballs for `darwin/arm64`, `darwin/amd64`, and `linux/amd64`
- publish artifacts + `checksums.txt` to `Pazuzzu/tahuna-cli` GitHub Releases
- update the Homebrew tap formula in `Pazuzzu/homebrew-tahuna`

Required repository secret:
- `HOMEBREW_TAP_GITHUB_TOKEN`: GitHub token with push access to `Pazuzzu/homebrew-tahuna`
- `RELEASES_GITHUB_TOKEN`: GitHub token with push access to `Pazuzzu/tahuna-cli`

Default API URL is `http://localhost:3000`.

### CLI auth flow

From `cli/`:

```bash
go run . login
```

This opens the browser, completes auth, and saves `TAHUNA_API_KEY` to `.env.local` in the current working directory.

### Train command

From `cli/`:

```bash
go run . train
go run . train -d
go run . train --gpu-type "<gpu>" --gpu-count 2 --volume-gb 120
```

- `train` creates a run and watches status in foreground.
- `train -d` creates a run and exits immediately after printing run summary.

### Init + Train flow

```bash
# Existing repo
go run . init .
go run . train

# New repo directory
go run . init new-project
cd new-project
go run /Users/pazuzzu/Desktop/gigi/boob-ai/cli train -d
```

- `init` creates/selects the project directory, creates an environment, and links it in `.tahuna/environment_id`.
- `train` uses the linked environment automatically.
- `env create` is intentionally removed; environment creation is done via `init`.

## Why this architecture

- Removes local Postgres/Redis/worker orchestration.
- Uses Convex as backend state + scheduling substrate.
- Keeps CLI standalone and API-compatible using Next route handlers.
- Preserves polling in CLI for long-running jobs.
