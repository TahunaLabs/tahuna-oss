# Tahuna Web

Next.js frontend coupled with Convex backend (dashboard + API routes).

## Run locally

```bash
cd web
bun install
bun run convex:dev
bun run dev
```

## Environment

Copy `.env.example` to `.env.local` and fill required values.

## Validation

```bash
cd web
bun run lint
```

## Notes

- Convex functions live under `web/convex`.
- CLI-facing HTTP endpoints are routed via `web/convex/http.ts` and related handlers.
