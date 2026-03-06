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
- Environment + run CRUD flows (CLI and dashboard)
- Data blob upload/list/remove in dashboard

Still pending:
- `train` command UX (`train`, `train -d`, config overrides)
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

Default API URL is `http://localhost:3000`.

### CLI auth flow

From `cli/`:

```bash
go run . login
```

This opens the browser, completes auth, and saves `TAHUNA_API_KEY` to `.env.local` in the current working directory.

## Why this architecture

- Removes local Postgres/Redis/worker orchestration.
- Uses Convex as backend state + scheduling substrate.
- Keeps CLI standalone and API-compatible using Next route handlers.
- Preserves polling in CLI for long-running jobs.
