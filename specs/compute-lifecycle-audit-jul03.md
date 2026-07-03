# Compute Lifecycle Audit Remediation — 3 Jul 2026

Source: full audit of the hosted compute lifecycle after moving training/serving billing onto
`computeSessions`. Verdict was **mostly good** — the ledger design (target-total upsert on
`compute_session:<id>:live_debit`) is race-safe and cannot double-charge — but the audit found
two high-severity leaks and a cluster of "stuck state" gaps where a single missed async callback
leaves a session/run/machine alive forever.

This spec is the remediation plan. It is written for an agent to execute in **bite-sized
commits**: one work item = one or two commits, each independently green.

## Ground rules for the executing agent

- After every commit: `cd web && bun run test:once && bun run lint` must pass.
- Keep the plan-layer (`web/convex/core/*Plan.ts`) pure — no `ctx`, no I/O. Behavior changes go
  into plans where possible so they are unit-testable; mutations/actions only wire them up.
- Do not change billing math or ledger idempotency keys. Nothing here should alter what a
  correctly-terminated session is charged.
- Each work item lists its own tests. Write the test **in the same commit** as the fix (or the
  commit immediately after if the fix commit is already large).
- Order matters: WI-1 → WI-4 are the money/machine leaks, do them first.

---

## WI-1 (HIGH): Force-deleting an active session-backed run orphans its compute session

**Symptom:** `runs.remove {force:true}` on an active run deletes the run row. Every path that
returns the session to `idle` requires the run row to exist *and* be terminal, so the session
stays `running` forever: the runtime keeps heartbeating (heartbeat timeout never fires),
`lastIdleAt` is never set (idle timeout never fires), and the 5-minute cron bills until
`insufficient_credits` drains the whole balance.

**Root cause:**
- `internalMarkIdleIfActiveRunTerminal` — `web/convex/computeSessions.ts:328` treats a missing
  run (`!run`) the same as a live run and returns early.
- `internalMarkIdleAfterRun` — `web/convex/computeSessions.ts:572` same shape.
- `deleteRunForUserId` — `web/convex/runsLifecycle.ts:387` never notifies the session.

**Fix plan:**

1. Treat a **missing** run as terminal in both idle-transition mutations. In
   `internalMarkIdleIfActiveRunTerminal` and `internalMarkIdleAfterRun`, change the guard from
   `if (!run || !TERMINAL_STATUSES.has(run.status)) return null;` to: proceed to idle when
   `!run` **or** run is terminal (only bail when the run exists and is still active). Keep the
   `row.activeRunId !== args.runId` guard in `internalMarkIdleAfterRun` as-is.
2. Belt-and-braces: make deletion proactively release the session. In `deleteRunForUserId`
   (`web/convex/runsLifecycle.ts`), when the run being deleted is ACTIVE and has a
   `computeSessionId`, schedule session teardown. Do this via the composition (the core file
   must not import `internal`): add an optional
   `releaseComputeSessionForDeletedRun?: (ctx, row: Doc<"runs">) => Promise<void>` hook to
   `RunLifecycleComposition` (`web/convex/runsLifecycle.ts:46`), implement it in
   `web/convex/cloud/runLifecycleComposition.ts` as
   `ctx.scheduler.runAfter(0, internal.computeSessions.internalTerminateStaleEnvironmentSession, {...})`
   (userId/environmentId/computeSessionId from the run row). Call it in `deleteRunForUserId`
   right where settlement for active runs already happens (`web/convex/runsLifecycle.ts:419`).
   Terminating (rather than idling) is correct here: for one-shot ephemeral sessions the session
   must die anyway, and for warm sessions the runtime is mid-run on a workload whose owner just
   force-deleted it — killing the session is the safe interpretation. If product prefers keeping
   warm sessions alive, step 1 alone already un-sticks them at the next runtime `assignment`
   poll; note this in the commit message.

**Commits:**
- `fix(compute-sessions): treat deleted runs as terminal when idling sessions` (step 1 + tests)
- `fix(runs): terminate backing compute session when force-deleting an active session run`
  (step 2 + tests)

**Tests (new file `web/convex/computeSessionsIdle.test.ts` or extend an existing mocked-ctx
suite in the style of `servesLifecycle.test.ts`):**
- session `running` with `activeRunId` pointing at a run id whose `ctx.db.get` returns `null`
  → `internalMarkIdleIfActiveRunTerminal` transitions the session to `idle` and sets
  `lastIdleAt`.
- same for `internalMarkIdleAfterRun` (posted `run_id` matches `activeRunId`, run missing).
- run exists and is still `running` → neither mutation idles the session (regression guard).
- `deleteRunForUserId` with a mocked composition: active run with `computeSessionId` → the
  release hook is invoked with the run's session id; terminal run → hook NOT invoked.

**Acceptance:** force-deleting an active session run leaves no session in `running`; a one-shot
session reaches `terminated` and settles.

---

## WI-2 (HIGH): Stop/delete racing serve machine creation leaks the provider machine

**Symptom:** stop or delete a serve while `provisionServe`'s `createMachine` call is in flight
(cold-start takes minutes). The stop path sees a session with no `providerMachineId` → session
goes straight to `terminated`, serve → `stopped`. When `createMachine` returns, the machine id
is recorded **nowhere** and nothing terminates it. It runs at the provider forever, unbilled
(Tahuna eats the cost). Its runtime can't even phone home because `serves.setRuntimeTokenHash`
(`web/convex/serves.ts:1270`) refused to persist the hash for a stopping serve.

**Root cause chain:**
- `planComputeSessionMachineProvisioned` — `web/convex/core/computeSessionLifecyclePlan.ts:172`
  silently returns `{}` for terminal sessions, so `internalMarkMachineProvisioned` drops the
  machine id on the floor with no signal to the caller.
- `internalTerminateStaleEnvironmentSession` — `web/convex/computeSessions.ts:796-801`
  early-returns for terminated/failed sessions without terminating anything.
- `provisionServe` — `web/convex/serves.ts:1546-1567` has no catch-path for "session turned
  terminal while I was creating the machine" (the runs path is protected only by accident:
  `internalAssignRun` throws and the catch terminates the machine,
  `web/convex/computeSessions.ts:510-525`).

**Fix plan:**

1. Give the caller a signal. Change `internalMarkMachineProvisioned`
   (`web/convex/computeSessions.ts:379`) to return
   `{ recorded: boolean }` (`v.object({ recorded: v.boolean() })`) instead of `v.null()`:
   `recorded: false` when the session is missing or the plan returned no patch (terminal
   session). Do **not** change the plan function's terminal no-op behavior — the session record
   staying clean is correct; the *machine* is what must die.
2. In `provisionServe` (`web/convex/serves.ts`), after `createMachine` succeeds:
   - if `internalMarkMachineProvisioned` returns `recorded: false`, immediately
     `await terminateRuntimeMachine(ctx, { providerMachineId })`, insert a session event via a
     small new `internalRecordOrphanedMachineTermination` mutation (append a
     `computeSessionEvents` row: status `terminated`, message
     `"terminated machine provisioned after session termination"`, metadata with
     `provider_machine_id`) for auditability, and return early. Wrap the terminate in
     try/catch; on failure fall back to `enqueueTerminateServeMachineJob` with `force: true`
     so the existing retry machinery owns it.
3. Same guard in the runs path `provisionComputeSession`
   (`web/convex/computeSessions.ts:497`): if `recorded: false`, terminate the machine, mark the
   run failed (`internal.runs.markFailed`, error
   `"compute session terminated during provisioning"`), and return — don't rely on
   `internalAssignRun` throwing.
4. Also cover the `catch` block in `provisionServe` (`web/convex/serves.ts:1568-1583`): today it
   re-calls `internalMarkMachineProvisioned` (which no-ops on terminal sessions) and then
   `markFailed` — if the session is already terminal the machine again leaks. After step 1 the
   catch can check `recorded` and terminate the machine directly, mirroring step 2.

**Commits:**
- `fix(compute-sessions): report whether machine provisioning was recorded` (step 1, plus
  updating both callers' call sites to consume the return value — behavior-neutral)
- `fix(serves): terminate machines provisioned after the session was stopped` (steps 2 + 4 + tests)
- `fix(runs): terminate machines provisioned after the session was stopped` (step 3 + tests)

**Tests:**
- unit (plan already covered): keep `computeSessionLifecyclePlan.test.ts` asserting terminal
  no-op.
- mocked-ctx action tests (style of existing mocked suites): drive `provisionServe` with a fake
  `computeProvider`/`provisionRuntimeMachine` seam where the session is terminated between
  token-hash write and machine creation → assert `terminateRuntimeMachine` is called with the
  new machine id and the serve/session records stay terminal. If mocking the action wholesale is
  too heavy, extract the post-`createMachine` decision into a pure helper
  (`resolvePostProvisionAction({ recorded, aborted }) → "continue" | "terminate_machine"`) in
  `web/convex/core/computeSessionLifecyclePlan.ts` and unit-test that, then keep the action
  wiring thin.

**Acceptance:** stopping a serve (or cancelling a run) at any point during machine creation
never leaves an untracked provider machine.

---

## WI-3 (MED/HIGH): Serve-backed sessions never leave `provisioning`; no liveness enforcement after `serving`; stuck `terminating` sessions never re-scanned

**Symptoms:**
- `provisionServe` only calls `internalMarkMachineProvisioned`; serve sessions sit in
  `provisioning` for their whole life. `internalListHeartbeatTimedOut`
  (`web/convex/computeSessions.ts:262-268`) scans only `["idle","running"]`, so a serve whose
  machine dies after reaching `serving` is detected by nothing — serve stays "serving"
  (inference 502s), session bills until credits are drained.
- A session stuck in `terminating` (terminate action lost — actions are at-most-once and the
  retry chain is scheduler-hop-based) is billable forever, and
  `applyComputeSessionLiveBillingResult` (`web/convex/cloud/billing.ts:436`) explicitly skips
  scheduling insufficient-credit termination for `terminating` rows.

**Fix plan (three independent commits):**

1. **Move serve sessions to `running` once provisioned.** In `provisionServe`
   (`web/convex/serves.ts`, after the `markMachineProvisioned` pair), add a new mutation
   `internal.computeSessions.internalMarkServingSession` that patches status
   `provisioning → running` via a new pure plan `planComputeSessionServing` (in
   `computeSessionLifecyclePlan.ts`; no `activeRunId`; terminal/no-op guard like the other
   plans; emits a `running` event `"compute session serving"`). `running` is already in
   `BILLABLE_COMPUTE_SESSION_STATUSES` and in the heartbeat scan, so billing is unchanged and
   enforcement turns on. Check `internalGetRuntimeAssignment`
   (`web/convex/computeSessions.ts:241`) is unaffected: it requires `activeRunId`, serve
   sessions have none, so it keeps returning `""` — fine.
   ⚠️ Verify the serve runtime image actually posts
   `/api/compute_sessions/{id}/runtime/heartbeat` (runtime code is outside this repo). If it
   does not, gate this commit behind the runtime change and note it in the commit body —
   otherwise every healthy serve gets killed by the heartbeat cron after
   `startupTimeoutSeconds`. If runtime heartbeats can't be confirmed, ship steps 2+3 only and
   file a follow-up.
2. **Sweep stuck `terminating` sessions.** Add
   `internalListTerminationTimedOut` query: sessions with status `terminating` whose most
   recent write is older than a new
   `RUN_CONFIG.computeSessionTerminatingTimeoutSeconds` (suggest `15 * 60`; add to
   `web/config.ts`). Since rows lack an `updatedAt`, use
   `terminatedAt`-less rows with `lastHeartbeatAt`/`computeStartedAt`/`createdAt` fallback via
   the existing `isComputeSessionHeartbeatTimedOut` helper with the new timeout — or simpler:
   add a `terminatingSince` timestamp to the `planComputeSessionStop` patch
   (schema: optional number on `computeSessions`) and compare against it. Wire a new action
   `enforceComputeSessionTerminationTimeouts` that re-drives
   `internalTerminateStaleEnvironmentSession` for each hit (it is idempotent), and register it
   in `web/convex/crons.ts` at `{ minutes: 5 }`.
3. **Let credit exhaustion retry stuck terminations.** In
   `applyComputeSessionLiveBillingResult` (`web/convex/cloud/billing.ts:436`) the
   `status !== TERMINATING` guard exists to avoid re-scheduling every tick. Replace it with:
   schedule when `owed` and (status !== terminating **or** `terminatingSince` older than the
   WI-3.2 timeout). With WI-3.2's cron in place this is a small redundancy — keep whichever is
   simpler; at minimum leave a comment pointing at the cron as the owner of stuck-terminating
   recovery.

**Commits:**
- `feat(compute-sessions): mark serve-backed sessions running after provisioning`
- `feat(compute-sessions): sweep sessions stuck in terminating` (schema + query + action + cron)
- `fix(billing): allow insufficient-credit termination of stuck terminating sessions`

**Tests:**
- `computeSessionLifecyclePlan.test.ts`: `planComputeSessionServing` transitions only from
  `provisioning`/`idle`, no-ops on terminal; `terminatingSince` set by `planComputeSessionStop`
  when a machine exists.
- new query test (mocked ctx): `internalListTerminationTimedOut` returns only `terminating`
  rows older than the timeout.
- billing test (extend `web/convex/cloud/billing.test.ts`): owed + `terminating` +
  stale `terminatingSince` → termination scheduled; owed + fresh `terminating` → not scheduled.
- heartbeat scan test: a `running` serve session with stale `lastHeartbeatAt` appears in
  `internalListHeartbeatTimedOut` output.

**Acceptance:** a serve machine that dies post-`serving` is terminated by the heartbeat cron
within ~2 minutes (given runtime heartbeats); no session can sit in `terminating` >15 minutes.

---

## WI-4 (MED): Session termination paths that don't carry `activeRunId` orphan the active run

**Symptom:** terminating a warm session while a run is executing — environment runtime-spec
update (`web/convex/environments.ts:672`), replacement-session creation
(`web/convex/computeSessionsLifecycle.ts:124`), serve paths, idle/one-shot paths, or the
insufficient-credit race (run assigned between the billing tick snapshot and the scheduled
termination) — clears `session.activeRunId` but never fails the run. The machine is gone, the
runtime never reports, and the run wedges in `running`/`cancelling` forever.

**Root cause:** only the heartbeat-timeout and insufficient-credit callers pass an
`activeRunId` to fail; `internalTerminateStaleEnvironmentSession`
(`web/convex/computeSessions.ts:781`) never reads the session's own `activeRunId`, and
`internalMarkTerminated`/`internalMarkFailed` clear it without touching the run.

**Fix plan:** fix it at the sink so *every* caller is covered. In
`internalMarkTerminated` and `internalMarkFailed` (`web/convex/computeSessions.ts:619,650`),
before applying the plan:

1. Read `row.activeRunId`; if set, load the run; if the run exists and is non-terminal, apply
   `planRunFailure` via `applyHostedRunLifecyclePlan` with error
   `"compute session terminated"` (or `"compute session failed: <error>"`). This settles
   run-side bookkeeping (session runs have no run-level billing, so settlement is timing-only —
   safe).
2. Also sweep runs that were mid-assignment: query `runs` `by_compute_session` for the session
   id and fail any row in `ACTIVE_STATUSES` (there can be at most one plus queued stragglers;
   this also covers the WI-1 window where `activeRunId` was already cleared). Cap the scan with
   `.take(10)` — more than that indicates a different bug.
3. Remove nothing from the existing callers that already pass `activeRunId`
   (`internalTerminateTimedOutSession`, `internalTerminateInsufficientCreditsSession`) — their
   `markFailed` calls become idempotent no-ops when the sink already failed the run.

**Commit:** `fix(compute-sessions): fail active runs when their session terminates`

**Tests (mocked ctx):**
- session `running` with `activeRunId` → `internalMarkTerminated` patches the run to `failed`
  with a terminal event, and the session terminates.
- run already terminal → untouched (plan no-op).
- queued run pointing at the session (`computeSessionId` set, status `queued`,
  `activeRunId` unset) → also failed by the sweep.
- serve-backed session (no runs) → no run writes.

**Acceptance:** `rg`-audit of all `internalTerminateStaleEnvironmentSession` /
`internalMarkTerminated` / `internalMarkFailed` call sites shows no path that can leave a
non-terminal run attached to a terminal session.

---

## WI-5 (LOW): `planComputeSessionTerminated` doesn't treat `failed` as terminal

**Root cause:** `web/convex/core/computeSessionLifecyclePlan.ts:309` no-ops only on
`terminated`, so a racing `onTerminated` callback flips a settled `failed` session to
`terminated`, losing the failure status/error (settlement re-runs but is a $0 no-op).

**Fix:** change the guard to `isTerminalComputeSessionStatus(args.session.status)`.

**Commit:** `fix(compute-sessions): keep failed sessions failed on late termination callbacks`

**Tests:** extend `computeSessionLifecyclePlan.test.ts`: `planComputeSessionTerminated` on a
`failed` session returns `{}`; on `terminating` still produces the terminated patch.

---

## WI-6 (LOW): Cancelled-after-termination runs keep a live runtime token; log/metric ingestion accepts terminal runs

**Root causes:**
- `planCancellationTerminationCompleted` (`web/convex/core/runLifecyclePlan.ts:475`) patches
  status `cancelled` without `runtimeTokenHash: "revoked"` (every other terminal transition
  revokes).
- `ingestRuntimeLogs` / `ingestRuntimeMetrics` (`web/convex/runs.ts:1875,1905`) and serve
  `ingestRuntimeLogs` (`web/convex/serves.ts:1875`) insert rows without checking terminal
  status, so a stale token can append forever.

**Fix plan:**
1. Add `runtimeTokenHash: "revoked"` to the `planCancellationTerminationCompleted` patch.
   ⚠️ Guard: only when the run is NOT session-backed (`!args.run.computeSessionId`) — session
   runs share the session's token value in their own column; revoking the run's copy is always
   safe, but double-check no code path compares the *session* hash via the run row. (Audit note:
   `internalValidateRuntimeToken` for runs compares the run row only, so revoking is safe
   unconditionally; keep it unconditional unless tests say otherwise.)
2. In the three ingest mutations, return `{ accepted: 0 }` when the row's status is terminal
   (use `TERMINAL_STATUSES` / `TERMINAL_SERVE_STATUSES`). Allow a small grace: accept when the
   terminal event is fresher than 60s if log tails matter — simplest is a hard cutoff; note the
   choice in the commit.

**Commits:**
- `fix(runs): revoke runtime token when cancellation termination completes`
- `fix(runs,serves): reject runtime log/metric ingestion for terminal targets`

**Tests:** `runLifecyclePlan.test.ts` asserts the revoke; mocked-ctx tests assert terminal
run/serve → `accepted: 0` and no insert.

---

## WI-7 (LOW): Reservation/billing scans don't scale and sweeps can starve

**Root causes:**
- `sumActiveComputeSessionReservationCents`
  (`web/convex/cloud/computeSessionReservations.ts:30-52`) collects **every** active session of
  every user, filters by user in JS. Runs on every launch validation.
- `billComputeSessionsFiveMinutes` (`web/convex/cloud/billing.ts:887-896`) `.collect()`s all
  active sessions and bills them in one mutation (unbounded transaction, OCC-conflict-prone).
- `internalListHeartbeatTimedOut` / `internalListIdleTimedOut`
  (`web/convex/computeSessions.ts:262-268,297-301`) `.take(limit)` **before** filtering; with
  >50 sessions in a status, older timed-out sessions are starved.

**Fix plan (three commits):**
1. Add index `by_user_and_status: ["userId", "status"]` to `computeSessions`
   (`web/convex/schema.ts:130`) and switch the reservation sum to query per status with
   `q.eq("userId", userId).eq("status", status)`.
2. Convert `billComputeSessionsFiveMinutes` into a fan-out: keep the cron entry pointing at a
   new internal **action** that pages sessions (query returns ids in batches of ~25 via the
   `by_status` index + cursor) and calls a new `internalBillComputeSessionBatch` mutation per
   batch. Keep `billLiveComputeSubject`/`applyComputeSessionLiveBillingResult` untouched.
   Preserve the returned counters by summing across batches.
3. Fix sweep starvation: in both timed-out queries, iterate with a paginated loop (cursor over
   the status index) filtering as you go until `limit` matches are found or the table is
   exhausted, instead of `take(limit)` then filter. Bound total scanned rows (e.g. 500) to keep
   the query cheap.

**Commits:**
- `perf(billing): scope reservation sums to the launching user` (schema index + query)
- `perf(billing): bill compute sessions in bounded batches`
- `fix(compute-sessions): don't starve timeout sweeps behind the first page of sessions`

**Tests:** reservation test asserting another user's active session does not affect the sum
(extend `billing.test.ts:85` case); batch-billing test asserting counters aggregate across two
batches; sweep test with `limit`+1 fresh sessions ordered before one stale session → stale
session is returned.

---

## WI-8 (INFO, cheap wins — one commit each, optional but recommended)

1. **Malformed ids on runtime HTTP routes → 500.** `web/convex/computeSessionsHttp.ts:46` and
   `web/convex/servesHttp.ts:53` cast raw path segments to `Id<...>`. Wrap the
   `runQuery(internalValidateRuntimeToken, …)` in try/catch and return 401 on throw (validator
   rejection). Commit: `fix(http): return 401 for malformed runtime ids`.
2. **`serves.internalRemove` guards.** `web/convex/serves.ts:1126`: before deleting records,
   if the serve is non-terminal and has NO `computeSessionId` but HAS a `providerMachineId`
   (legacy row), enqueue `terminate_serve_machine {force:true}` first. Commit:
   `fix(serves): terminate legacy serve machines on delete`.
3. **Prune dead serve token surface.** `serves.runtimeTokenHash` +
   `by_runtime_token_hash` index (`web/convex/schema.ts:183,217`) no longer participate in auth
   (auth reads the session hash). Keep the column writes (plans still set `"revoked"`) but drop
   the unused index; or defer entirely. Commit: `chore(schema): drop unused serve token index`.
   Do this LAST — it's the only schema-destructive change.
4. **Document reservation semantics.** Reservations are advisory row-derived holds, not ledger
   holds; concurrent debits can consume the reserved balance. Add a paragraph to
   `specs/ledger.md`. Commit: `docs(ledger): document advisory reservation semantics`.

---

## Missing test coverage backlog

Items 1–6 land inside the WIs above. The rest are standalone test-only commits:

| # | Coverage gap | Where it lands |
|---|---|---|
| 1 | Force-delete active session run → session terminates & settles | WI-1 |
| 2 | Stop/delete racing machine creation → machine terminated, nothing leaks | WI-2 |
| 3 | Serve session heartbeat enforcement + stuck-`terminating` sweep | WI-3 |
| 4 | Env runtime update / session replacement while run active → run fails | WI-4 |
| 5 | `failed` vs late `terminated` callback keeps failure status | WI-5 |
| 6 | Terminal-target log/metric ingestion rejected; token revoked on cancel-termination | WI-6 |
| 7 | Sweep starvation beyond first status page | WI-7 |
| 8 | Concurrent double-terminal settlement is a $0 no-op | standalone |
| 9 | Insufficient-credit flow end-to-end (owed tick → run failed → serve failed → session terminated with `reason: insufficient_credits`, reservation released) | standalone |
| 10 | Scheduler-driven termination retry chain (lost action hop → cron recovery from WI-3.2) | standalone |

**Standalone test commits:**

- `test(compute-sessions): double-terminal settlement is idempotent` — mocked ctx: settle a
  session terminally (charged), then apply `planComputeSessionTerminated` on the
  already-`failed` row and assert `settleComputeCharge` produces `chargeDeltaCents: 0` and no
  new `usageEvents` write (extend `web/convex/cloud/runBilling.test.ts`, which already has the
  ledger fake).
- `test(billing): insufficient-credit termination end-to-end` — extend
  `web/convex/cloud/billing.test.ts:188`: after the owed tick schedules
  `internalTerminateInsufficientCreditsSession`, drive the mutation chain with a mocked ctx and
  assert: run `failed` with the credits-exhausted error, serve `failed` via
  `markComputeSessionBillingFailed`, session event carries
  `terminationReason: "insufficient_credits"`, reservation fields zeroed with a
  `computeReservationReleasedAt`.
- `test(compute-sessions): terminating sweep recovers a lost terminate action` — with WI-3.2 in
  place: session in `terminating` with stale `terminatingSince` and a live machine id → the
  sweep query returns it and the re-driven action's `shouldTerminate` returns true.

## Suggested commit sequence (summary)

1. WI-1 commit 1 (missing-run idle fix)
2. WI-1 commit 2 (delete → session teardown)
3. WI-2 commit 1 (`recorded` return value)
4. WI-2 commit 2 (serve orphan-machine terminate)
5. WI-2 commit 3 (run orphan-machine terminate)
6. WI-4 (fail active runs at the termination sink)
7. WI-3 commit 1 (serve sessions → `running`) — *verify runtime heartbeats first*
8. WI-3 commit 2 (`terminating` sweep: schema + cron)
9. WI-3 commit 3 (billing guard for stuck terminating)
10. WI-5 (terminal-status guard)
11. WI-6 commits 1–2 (token revoke, ingestion guards)
12. WI-7 commits 1–3 (index, batch billing, sweep pagination)
13. Standalone test commits (settlement idempotency, insufficient-credit e2e, sweep recovery)
14. WI-8 commits 1–4 (HTTP 401s, legacy serve delete, schema prune, docs)

Every commit: `cd web && bun run test:once && bun run lint` green before moving on.
