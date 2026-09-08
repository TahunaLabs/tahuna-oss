# Dashboard And Web App

Last reviewed: 2026-07-03

## Current Behavior

The web app is a Next.js 16 / React 19 app backed by Convex. The dashboard is session-authenticated and uses query-string state for the active view. The default view on load is `overview`.

Dashboard views:

- Overview (default)
- Storage
- Environments
- Serving
- Runs
- Billing
- Machines
- Audit logs
- Settings

The dashboard renders an app shell with a sidebar, top bar, and view containers. Data access is centralized through dashboard API hooks in `web/lib/dashboard-api.ts` and cloud dashboard hooks in `web/cloud/dashboard-api.ts`.

## Main Capabilities

- Overview: KPI tiles (total runs, active runs, credits balance, environments), training activity chart (14-day run count), recent runs list.
- Storage: list, search, sort, upload, delete, rename artifacts, set visibility, share links.
- Environments: list, show/edit synced config, bind/unbind data, create runs, delete.
- Runs: list, filter active/completed, show details, logs, metrics, cancel, delete, share.
- Serving: list serves, show details/logs, stop serves, expose inference path.
- Billing: initialize user ledger, show credit balance and usage events.
- Audit logs: show run/serve lifecycle events and credit ledger events, including compute-session-level training and serving billing.
- Machines: list/revoke API keys used as CLI machine sessions.
- Settings: account/profile display and API-key related controls.

## Top Bar

The top bar shows a breadcrumb (`Dashboard / <View>`) and a search button that opens the command menu. It also links to docs.

## Command Menu (⌘K)

`DashboardCommandMenu` opens via ⌘K or the search button in the top bar. It lets users navigate to any view and jump directly to recent runs or environments. Queries are only fired while the menu is open.

## Sidebar

The sidebar has a "New run" shortcut button (navigates to the Environments view) and a credits widget in the footer showing the current balance and an "Add credits" button. The brand lockup (`BrandLockup`) replaces the old logo + wordmark pattern.

## Billing And Audit Logs

Training compute billing is displayed at the compute-session grain. One-shot runs may show the attached compute-session charge for compatibility, but the audit log should identify compute settlement debits as compute-session events and show total compute-session uptime.

Warm-session idle spend should be visible as compute-session spend. The UI must not silently smear idle spend across the runs attached to that warm session.

Serving compute billing is displayed at the compute-session grain while serve lifecycle, health, routing, and logs remain serve-owned.

## Run Detail

`RunDashboard` is a shared component used both in the inline panel (`RunsView`) and on the dedicated run page (`/dashboard/runs/[id]`). The old `RunDetailPanel` and `MetricSection` components were removed.

## Public Site

The landing page is the real home page. See `specs/product/landingPage.md`.

## Invariants

- Dashboard data is user-scoped.
- The web app uses Convex Auth session state.
- The inference proxy runs in Next.js Node runtime and does not cache responses.
