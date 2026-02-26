# tahuna

GPU provisioning platform for ML training. The architecture is now:
- `web`: Next.js + Convex (UI + backend API)
- `cli`: standalone Go CLI for end users

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

## Why this architecture

- Removes local Postgres/Redis/worker orchestration.
- Uses Convex as backend state + scheduling substrate.
- Keeps CLI standalone and API-compatible using Next route handlers.
- Preserves polling in CLI for long-running jobs.
