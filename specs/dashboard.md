# Spec: Dashboard & Web App

## Scope

Full-control web dashboard for managing environments, runs, data, and artifacts. Provides real-time streaming of logs and metrics during training. All operations available in the CLI are also available in the dashboard.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Dashboard page | Next.js page | `/dashboard` — main authenticated UI |
| Auth pages | Next.js pages | `/auth/cli` (CLI callback), `/login` |
| Machines page | Next.js page | `/machines` — active CLI/browser sessions (view/revoke) |
| Storage section | Dashboard section | User-owned data items + run output artifacts |
| Convex real-time | Backend | Live subscriptions for runs, logs, metrics |

## Lifecycle

### Authentication

- Dashboard uses Better Auth session (cookie-based).
- CLI auth page (`/auth/cli`) handles the browser half of CLI login flow.
- Dashboard does NOT create API keys (that remains CLI-only via `tahuna login`).
- Dashboard exposes session-oriented machine management (revoke access per machine/session) instead of legacy API key-centric UX.
- `/login` and `/machines` use the same visual theme system as `/dashboard` (no legacy standalone styling).

### Environment Management

| Action | UI Element | Backend |
|--------|-----------|---------|
| List environments | Table/card view | Convex query `environments.by_user` |
| View environment details | Detail panel | Environment record + sync status |
| Update specs | Edit form (GPU type, count, volume) | `PATCH /api/environments/{id}` |
| Edit environment config | Structured form generated from selected config file | Config parser + env config update mutation |
| Bind existing data | "Attach Data" selector from Storage inventory | Environment data-binding mutation |
| Delete environment | Delete button + confirmation dialog | `DELETE /api/environments/{id}` (cascade) |

- Dashboard does NOT create environments (that's `tahuna init` only).
- Dashboard shows sync status: last sync time, code/data manifest hashes.
- Environment detail view includes a rendered "Configuration" section from the init-selected config file so users can tune values before run creation.

### Run Management

| Action | UI Element | Backend |
|--------|-----------|---------|
| Create run | "New Run" button per environment (optional run name) | `POST /api/environments/{env_id}/runs` |
| Rename run | Inline name edit or rename dialog | `PATCH /api/runs/{id}` |
| List runs | Table sorted by creation time | Convex query `runs.by_user` |
| View run details | Detail panel | Run record + events + artifact keys |
| Cancel run | Cancel button (with confirmation) | Sets `cancellationRequested` |
| Delete run | Delete button + confirmation | `DELETE /api/runs/{id}` |

### Real-Time Streaming

During an active run, the dashboard shows:

```
+------------------------------------------+
| Run: <run_id>         Status: RUNNING    |
+------------------------------------------+
| LOGS                    | METRICS        |
| [streaming log output]  | loss: 0.42 [v] |
| [streaming log output]  | acc:  0.89 [^] |
| [streaming log output]  | epoch: 3/10    |
|                         |                |
|                         | [live chart]   |
+------------------------------------------+
| Artifacts: (available after completion)  |
+------------------------------------------+
```

- Logs: Convex real-time subscription on `runRuntimeLogs.by_run`.
- Metrics: Convex real-time subscription on `runRuntimeMetrics.by_run`.
- Charts: Live-updating line charts for numeric metrics (loss, accuracy, etc.).
- Auto-scroll logs to bottom with pause-on-scroll-up behavior.

### Artifact Management

| Action | UI Element | Backend |
|--------|-----------|---------|
| Browse run output artifacts | Storage section + run detail file tree | Read output artifact keys from run records |
| Download artifact | Download button per file | Generate signed R2 download URL |
| Delete artifact | Delete button + confirmation | Remove from R2 + update run record |
| Rename artifact | Inline rename | Move R2 object + update run record |

- All artifact operations directly reflect on R2 (no local caching layer).
- Artifact browser shows: filename, size, upload timestamp.
- New files synced from pod-selected output directories should appear in Storage automatically after upload/commit.

### Data Binding

- Users can bind existing data (already in R2) to any environment without duplication.
- UI: "Attach Data" action on environment -> browse Storage data manifests -> select one or many -> link.
- Backend: update environment data bindings (primary + additional bound manifests).
- No data copy — just pointer update. Multiple environments can reference the same data blobs.

### Data Upload (dashboard)

- Dashboard supports direct data upload for users who don't use CLI sync.
- Upload UI in environment detail view.
- Files uploaded directly to R2 with signed URLs.
- Generates data manifest and stores it in Storage.
- User can then bind uploaded data items to one or multiple environments.

## Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing / marketing page |
| `/login` | Dashboard sign-in page |
| `/auth/cli` | CLI login callback handler |
| `/dashboard` | Main authenticated dashboard |
| `/dashboard/environments/{id}` | Environment detail (future) |
| `/dashboard/runs/{id}` | Run detail with logs/metrics (future) |
| `/machines` | Session/machine management (view/revoke) |

## Invariants

- Dashboard requires authenticated session (redirect to sign-in if not).
- All data shown is user-scoped. Users never see other users' environments/runs.
- Real-time updates use Convex subscriptions, not polling.
- Artifact operations are immediately reflected in R2 (no eventual consistency from the user's perspective).
- Dashboard environment creation is intentionally not supported — `tahuna init` is the only creation path.
- Storage section is the canonical dashboard surface for user data items and run output artifacts.

## Error States

| Condition | Behavior |
|-----------|----------|
| Session expired | Error: "Session expired. Please sign in again." + redirect to `/login`. |
| Run not found | Error: "Run not found." |
| Artifact download fails | Error toast: "Failed to generate download link." |
| Real-time connection lost | Warning banner: "Connection lost. Reconnecting..." (retry policy from shared config). |
| Delete confirmation | All destructive actions require explicit confirmation dialog. |

## Dependencies

- Better Auth (session management)
- Convex (real-time subscriptions, queries, mutations)
- R2 (artifact storage, signed URLs)
- Environments spec (management rules)
- Run lifecycle spec (state machine, cancellation)
