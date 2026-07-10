# Known Regressions

## Confirmed

- `web/app/api/serves/[serveId]/inference/[[...path]]/route.ts` mixes two concerns. The browser-session auth check legitimately needs to live in Next.js (`fetchAuthAction`/`isAuthenticated` use `convexBetterAuthNextJs`, which reads the session cookie via `next/headers` — no Convex equivalent). But the actual reverse-proxy logic bolted onto it (header blocklists, streaming fetch, timeouts, body-size limits, error-to-status mapping, ~250 of 363 lines) has no Next.js dependency and could be a Convex `httpAction`, same as `wandbFileStream`/`wandbUpload` in `convex/http.ts` already do. The bearer-token/API-key auth path in this same file bypasses Next.js's Better Auth SDK entirely, so it has no reason to live here at all. Scope creep on a route that had to exist for one reason, not a missed pattern.

- `convex/computeSessions.ts`'s `internalListHeartbeatTimedOut` throws on every run of the `enforceComputeSessionHeartbeatTimeouts` cron. It loops over `["idle", "running"]` and calls `collectComputeSessionTimeoutMatches` (runs `ctx.db.query(...).paginate()`) once per status inside the same function — Convex only allows one paginated query per function call. Pre-existing, last touched in `d383ae5e`. Fires on cron cadence, not tied to any user action:

  ```
  7/10/2026, 6:24:40 PM [CONVEX Q(computeSessions:internalListHeartbeatTimedOut)] Uncaught Error: This query or mutation function ran multiple paginated queries. Convex only supports a single paginated query in each function.
      at async collectComputeSessionTimeoutMatches (../convex/computeSessions.ts:290:31)
      at async handler (../convex/computeSessions.ts:377:8)

  7/10/2026, 6:24:40 PM [CONVEX A(computeSessions:enforceComputeSessionHeartbeatTimeouts)] Uncaught Error: Uncaught Error: This query or mutation function ran multiple paginated queries. Convex only supports a single paginated query in each function.
      at async collectComputeSessionTimeoutMatches (../convex/computeSessions.ts:290:31)
      at async handler (../convex/computeSessions.ts:377:8)

      at async handler (../convex/computeSessions.ts:938:13)
  ```

## Code Smells

- The cosmetic error-message consistency rework (`web/lib/error-messages.ts` and the files it touches) was verified by typecheck, lint, and build only — not manually tested, since it's message text and branching only, no control-flow changes.
