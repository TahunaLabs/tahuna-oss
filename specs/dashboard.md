# Dashboard And Web App

Last reviewed: 2026-05-07

## Current Behavior

The web app is a Next.js 16 / React 19 app backed by Convex. The dashboard is session-authenticated and uses query-string state for the active view.

Dashboard views:

- Storage
- Environments
- Serving
- Runs
- Billing
- Providers
- Machines
- Audit logs
- Settings

The dashboard renders an app shell with a sidebar, top bar, credits gauge, and view containers. Data access is centralized through dashboard API hooks in `web/lib/dashboard-api.ts` and cloud dashboard hooks in `web/cloud/dashboard-api.ts`.

## Main Capabilities

- Storage: list, search, sort, upload, delete, rename artifacts, set visibility, share links.
- Environments: list, show/edit synced config, bind/unbind data, create runs, delete.
- Runs: list, filter active/completed, show details, logs, metrics, cancel, delete, share.
- Serving: list serves, show details/logs, stop serves, expose inference path.
- Providers: remove from the hosted cloud path; provider credentials are deployment-owned managed billing configuration.
- Billing: initialize user ledger, show balance and usage events.
- Machines: list/revoke API keys used as CLI machine sessions.
- Settings: account/profile display and API-key related controls.

## Public Site

The landing page is the real home page and uses these sections:

- navigation
- Founders Inc badge
- hero
- framework bar
- install/terminal loop
- core loop layers
- footer

## Invariants

- Dashboard data is user-scoped.
- The web app uses Convex Auth session state.
- The inference proxy runs in Next.js Node runtime and does not cache responses.
