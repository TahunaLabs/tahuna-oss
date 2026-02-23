# Tahuna Web (SvelteKit)

Web dashboard + landing UI for Tahuna.

## Getting Started

```bash
cd apps/web
bun install
bun run dev
```

The dev server runs at [http://localhost:5173](http://localhost:5173).

## Tech Stack

- **Framework**: SvelteKit
- **Build Tool**: Vite
- **Language**: TypeScript

## Routes

- `/` landing page (auto-redirects to `/dashboard` when logged in)
- `/auth` email OTP auth flow
- `/dashboard` environments / experiments / runs console
- `/api-key` API key generation for CLI
- `/api/*` authenticated proxy routes to backend

## Environment

Copy `.env.example` to `.env.local` and set values as needed.
