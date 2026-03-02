# Tahuna Web

Next.js frontend coupled with Convex backend (queries, mutations, scheduling, auth plumbing).

## Run locally

```bash
cd web
bun install
bun run convex:dev
bun run dev
```

## Environment

Copy `.env.example` to `.env.local` and set:
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `NEXT_PUBLIC_SITE_URL`
- `SITE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

## Notes

- Dashboard and CLI routes are served by Next route handlers.
- Convex functions live under `web/convex`.
- OTP emails are sent through the Convex Resend component.
- Legacy Go backend/worker/provisioner has been removed.
