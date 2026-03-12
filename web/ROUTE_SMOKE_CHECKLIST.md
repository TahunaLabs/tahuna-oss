# Auth Route Smoke Checklist

Run this checklist after auth route changes.

## Browser routes

- Open `/login`: login form loads.
- Open `/auth`: redirects to `/login`.
- Open `/auth?redirect=%2Fdashboard`: lands on `/login?redirect=%2Fdashboard`.

## Authenticated behavior

- Sign in from `/login`: redirected to `/dashboard`.
- Sign out from `/dashboard`: redirected to `/login`.

## CLI browser auth flow

- Open `/auth/cli?state=test&callback=http%3A%2F%2F127.0.0.1%3A9999%2Fcallback&machine=test`.
- If signed out: redirect to `/login?redirect=.../auth/cli...`.
- After sign-in: return to `/auth/cli` and continue callback flow.
