# Tahuna Autoresearch Local MVP

Last reviewed: 2026-06-15

Linear: TAH-318

## Goal

Add a local `tahuna research run` workflow that proves Karpathy-style autoresearch on top of Tahuna's existing training primitives.

The local MVP keeps the research controller on the user's machine. Tahuna continues to own the expensive and observable part of the loop: syncing code/data, launching GPU training runs, ingesting logs/metrics, uploading artifacts, and tracking run state.

The user's local agent owns code edits through a Tahuna autoresearch skill. The Tahuna CLI must not configure or launch a coding agent. It exposes deterministic research primitives the agent can call.

Reference: <https://github.com/karpathy/autoresearch>

## Current Implementation Status

Implemented:

- Deterministic final metric lookup over persisted `runRuntimeMetrics`.
- CLI research command routing for `tahuna research run` and `tahuna research graph`.
- Session JSON persistence under `.tahuna/research/<session-id>.json`.
- Baseline run orchestration through the normal Tahuna sync/train/monitor path.
- Git safety for dirty project files, editable allowlist matching, patch snapshots, patch hashes, and incumbent snapshots.
- Single-trial resume loop for `tahuna research run --resume <session-id>`.
- Trial verdicts for `accepted`, `rejected`, and `inconclusive`.
- Patch restore for rejected or inconclusive tracked-file candidate patches.
- Project-scoped git handling for Tahuna projects inside larger git repositories.
- Budget enforcement and cancellation for `--max-trials`, `--max-spend-usd`, `--max-trial-minutes`, `--stop-after-no-improvement`, and `--min-improvement`.
- Estimated and observed spend recording in session state.
- SVG progress graph rendering from session state.
- Public Auto-Research docs for the local CLI harness.
- External agent-skill handoff checklist for `tahuna-autoresearch-project`.
- Warm compute support through `tahuna research run --keep-warm-minutes <minutes>`.
- Baseline warm-session creation and trial warm-session reuse.
- Runtime-spec pinning in research session state and resume-time runtime-spec drift rejection.
- Optional trial labels through `tahuna research run --resume <session-id> --trial-title <title>`.
- Best-effort backend research metadata sync after local session saves.
- Backend `researchSessions` and `researchExperiments` tables for Dashboard Hillclimb rendering.
- CLI-facing `POST /api/research/sessions/sync` endpoint for authenticated session snapshot sync.
- Dashboard Hillclimb view under `?view=hillclimb`, using synced metadata when available and run-name inference as a fallback for older sessions.

Still needed:

- Apply the `tahuna-autoresearch-project` checklist in the external `TahunaLabs/agent-skills` repository.
- Allocate warm-session idle/billing time into Auto-Research spend accounting.
- Auto-Research now requires explicit `--keep-warm-minutes`; it does not inherit `train.keep_warm_after_minutes`.
- Auto-generate trial summaries from patches when `--trial-title` is omitted.

## Implementation PR Plan

Implement the MVP in reviewable slices:

1. **Final metric API**
   - Add deterministic `GET /api/runs/{run_id}/metrics/final?name=<metric>` lookup over persisted `runRuntimeMetrics`.
   - Select the final sample by metric name, preferring `source=train` when present, then highest numeric step, then newest timestamp.
   - Return a `detail` error when the final metric was not emitted.
   - Validate with `cd web && bun run lint`.

2. **Research command skeleton and session state**
   - Add `tahuna research run` and `tahuna research graph` command routing, help text, flag parsing, and human/verbose output.
   - Persist inspectable session JSON under `.tahuna/research/<session-id>.json`.
   - Validate project, linked environment, git repository, direction, metric source, budget flags, and editable allowlist.
   - Keep baseline/trial launch out of this slice.
   - Validate with `make validate-cli`.

3. **Baseline run**
   - Wire a new session to code/data sync, named baseline run creation, terminal polling, final metric capture, baseline/incumbent persistence, and `awaiting_patch` exit.
   - Validate with `make validate-cli`.

4. **Git safety and editable allowlist**
   - Add dirty tree checks, changed-file allowlist matching, patch snapshots, patch hashes, and incumbent restore primitives.
   - Refuse unexpected changes before any GPU run.
   - Validate with `make validate-cli`.

5. **Single-trial resume loop**
   - Implement `tahuna research run --resume <session-id>` for one candidate patch.
   - Validate the patch, sync code, launch `research-<session>-trial-<N>`, score the run, accept/reject/inconclusive the patch, and append trial state.
   - Candidate patches currently must be tracked-file diffs; untracked files are rejected before GPU spend so restore remains deterministic.
   - Validate with `make validate-cli`.

6. **Budgets and cancellation**
   - Enforce `--max-trials`, `--max-spend-usd`, `--max-trial-minutes`, `--stop-after-no-improvement`, and `--min-improvement`.
   - Estimate spend from GPU catalog, effective run compute, observed baseline duration, and current elapsed run time.
   - Cancel or mark trials inconclusive when `--max-trial-minutes` is exceeded.
   - Validate with `make validate-cli`.

7. **Progress graph**
   - Implement `tahuna research graph <session-id> --output <path>` as local SVG rendering from session state.
   - Plot baseline, accepted/rejected/inconclusive trials, and running best.
   - Validate with `make validate-cli`.

8. **Docs and agent skill follow-up**
   - Update CLI docs for graph rendering and record the external `tahuna-autoresearch-project` agent skill checklist after the CLI harness is usable.
   - Keep Tahuna CLI as a harness only; it must not launch or configure an agent.

9. **Dashboard research metadata sync**
   - Add authenticated CLI session snapshot sync to the backend.
   - Persist research sessions and experiments separately from ordinary run rows.
   - Keep the local `.tahuna/research/<session-id>.json` file as the resume source of truth.
   - Use synced titles, labels, values, and running best in Dashboard Hillclimb when available.
   - Keep run-name parsing as a fallback for sessions created before metadata sync existed.

## Non-Goals

- No cloud-hosted coding agent in the MVP.
- No CLI flags for selecting a coding agent.
- No backend scheduler for the research loop in the MVP.
- No new GPU runtime mode for research.
- No automatic edits outside an explicit user allowlist.
- No multi-objective optimizer in the first implementation.
- No external scorer command in the local MVP; training code should emit a stable final metric.

## User-Facing Command

```bash
tahuna research run \
  --program program.md \
  --metric final:val_bpb \
  --minimize \
  --max-trials 20 \
  --max-spend-usd 50 \
  --max-trial-minutes 30 \
  --keep-warm-minutes 30 \
  --editable train.py
```

Equivalent maximize form:

```bash
tahuna research run \
  --program program.md \
  --metric final:reward \
  --maximize \
  --max-trials 20 \
  --max-spend-usd 50 \
  --editable "src/training/**"
```

Progress graph:

```bash
tahuna research graph <session-id> \
  --output .tahuna/research/<session-id>/progress.svg
```

Resume trial with a Dashboard label:

```bash
tahuna research run \
  --resume <session-id> \
  --trial-title "faster learning rate"
```

## Execution Model

`tahuna research run` is safe for a user agent skill to call repeatedly. It must not invoke an agent itself.

New session behavior:

- Create the session.
- Run and score the baseline.
- If no candidate patch is present, write session status `awaiting_patch`, print the next trial number, and exit successfully.

Resume behavior:

- The agent skill edits allowed files.
- The agent calls `tahuna research run --resume <session-id> --trial-title "<short label>"`.
- Tahuna validates the current patch, launches the next trial, records the verdict, restores or keeps the patch, and exits.
- If more trials remain, Tahuna prints the next `--resume` command.
- If no further trial can launch within configured budgets, Tahuna writes session status `budget_exhausted`.
- The agent can call `tahuna research graph <session-id>` to regenerate the local progress SVG after trials.

This gives the user's agent the control loop without making Tahuna an agent launcher.

### Warm Compute Execution

Auto-Research can reuse the same warm Tahuna machine across a baseline and sequential trial runs:

```bash
tahuna research run \
  --program program.md \
  --metric final:val_bpb \
  --minimize \
  --max-trials 20 \
  --max-spend-usd 50 \
  --max-trial-minutes 30 \
  --keep-warm-minutes 30 \
  --editable train.py
```

With `--keep-warm-minutes`, the baseline run starts the environment's warm compute session by creating a normal run with `keep_warm_after_minutes`. Later `--resume` calls create trial runs with `warm=true`, so they attach only to the environment's canonical `activeComputeSessionId`.

Warm Auto-Research follows the same run/compute split as `tahuna train --warm`:

- each baseline and trial remains a separate run
- each run owns its own pinned code/data manifests, logs, metrics, artifacts, and terminal status
- the warm machine is linked by the backend environment, not by local `.tahuna/` state
- code and data changes are allowed between trials
- runtime spec changes are not allowed inside the same warm research session

Runtime spec means GPU type, GPU count, volume size, framework, framework version, Python version, and resolved runtime image.

When a research session starts, Tahuna records the local runtime spec from `tahuna.toml`. On resume, Tahuna rejects local runtime-spec drift before syncing or launching a run. If warm compute is stale or busy, the resume command surfaces that condition directly instead of silently launching cold compute or counting the candidate as an inconclusive trial.

## Core Loop

1. Validate the local project.
   - Must run inside a Tahuna project.
   - Must have a linked environment.
   - Must run inside a git repository.
   - Must refuse a dirty working tree outside `--editable` paths unless `--allow-dirty` is passed.

2. Sync the baseline.
   - Run `tahuna sync code`.
   - Run `tahuna sync data` only when data is missing or the project requires a fresh data manifest.
   - Launch `tahuna train --name research-<session>-baseline`.

3. Capture the baseline objective.
   - Wait until the baseline run reaches a terminal status.
   - Resolve the final objective value.
   - Persist the run ID, metric value, and terminal status to `.tahuna/research/<session-id>.json`.
   - If no candidate patch exists, set session status to `awaiting_patch` and exit.

4. Start trial `N`.
   - The user's local agent skill reads the session state, prior trial summaries, current incumbent metric, and editable allowlist.
   - The agent makes one coherent candidate patch.
   - Tahuna validates that the patch only touches allowed paths.
   - If no allowed patch exists, record the trial as `inconclusive` and continue or stop based on retry policy.

5. Launch the trial.
   - Run `tahuna sync code`.
   - Launch `tahuna train --name research-<session>-trial-<N>`.
   - Wait until the run reaches a terminal status.
   - Resolve the final objective value.

6. Decide.
   - If the trial has no valid final metric, mark it `inconclusive` and revert the patch.
   - If the metric improves over the incumbent, mark it `accepted` and keep the patch.
   - If the metric does not improve, mark it `rejected` and revert the patch.
   - Continue until `--max-trials`, wall time, spend budget, or no-improvement budget is exhausted.

7. Finish.
   - The working tree contains the best accepted patch.
   - The session file contains the full audit trail.
   - The progress graph shows the baseline, accepted trials, rejected trials, inconclusive trials, and the running best line.
   - Human output prints baseline, incumbent, each trial value, and final recommendation.

## Agent Skill Ownership

The full autoresearch loop is performed by the user's local agent through a Tahuna skill. Tahuna does not need to know whether the agent is Codex, Claude, Cursor, or another tool.

Tahuna CLI owns:

- Session state.
- Budget checks.
- Patch safety checks.
- Code/data sync.
- Training run launch and polling.
- Final metric capture.
- Trial verdicts.
- Progress graph rendering.

The agent skill owns:

- Reading `program.md`.
- Proposing the next hypothesis.
- Editing allowed files.
- Explaining the candidate patch.
- Calling Tahuna commands between edits, including `--trial-title` for readable Dashboard labels.
- Regenerating or reading `tahuna research graph` when useful.
- Stopping when Tahuna reports that budgets are exhausted.

This keeps Tahuna as the research harness rather than an agent runner.

### External Skill Follow-Up Checklist

Update the external `tahuna-autoresearch-project` skill in `TahunaLabs/agent-skills` to use the local CLI harness instead of manually creating detached runs or maintaining a separate ledger.

The intended skill behavior:

- Start a new session with `tahuna research run --program <program.md> --metric final:<name> --minimize|--maximize ...` or resume an existing session when the user provides a session id.
- Read `program.md` and `.tahuna/research/<session-id>.json` before each candidate edit.
- Loop only for the user-requested wall-clock duration, for example 2 hours.
- Make one coherent tracked-file candidate patch at a time.
- Never edit outside the session editable allowlist.
- Never add untracked files unless future CLI support exists.
- Call `tahuna research run --resume <session-id> --trial-title "<short label>"` for each candidate.
- Regenerate or read `tahuna research graph <session-id>` after trials when useful.
- Stop on `budget_exhausted`, no remaining wall-clock time, or repeated inconclusive failures.
- Summarize the best accepted patch, best run id, baseline value, current best metric, trial counts, and any remaining recommended hypotheses.
- For long loops, prefer `tahuna research run --keep-warm-minutes <minutes>` when the user accepts the warm-compute cost.
- Preserve runtime spec fields during a warm research session; do not edit GPU type/count, volume, framework, framework version, Python version, or image unless the user explicitly starts a new warm session.
- If Tahuna reports warm compute is stale or busy, stop and report that condition instead of retrying with cold compute.

The skill must keep Tahuna as a harness. It must not ask Tahuna CLI to launch, configure, or manage an agent.

## Budget Contract

Research must be budget-aware before each GPU run is launched.

Budget flags:

```bash
--max-trials 20
--max-spend-usd 50
--max-trial-minutes 30
--stop-after-no-improvement 5
--min-improvement 0.01
```

Rules:

- Tahuna must check remaining budget before launching baseline or trial runs.
- Tahuna must refuse to launch a trial if the estimated next run would exceed `--max-spend-usd`.
- Tahuna must cancel or mark a trial `inconclusive` if it exceeds `--max-trial-minutes`.
- Tahuna must stop the session after `--stop-after-no-improvement` consecutive rejected or inconclusive trials.
- `--min-improvement` defines the minimum absolute objective change required to accept a patch.
- Spend estimates should use the effective GPU type/count, hourly rate, observed baseline duration when available, and current run elapsed time.
- Current warm compute gap: spend accounting estimates and records per-run execution duration. It does not yet allocate idle warm-session machine time across the research session.

## Self-Audit

### Solid Decisions

- Auto-Research now uses the same run/session surface as `tahuna train --warm`; there is no separate research-only runtime mode.
- Baseline warm-session creation uses `keep_warm_after_minutes`, and trial resumes use `warm=true`.
- Each baseline and trial remains a distinct run with pinned manifests and isolated logs, metrics, artifacts, and terminal status.
- Research session state records the starting runtime spec and rejects local runtime-spec drift before sync or run creation.
- Warm stale/busy errors are surfaced directly and do not count the candidate patch as an inconclusive trial.

### Intentional Pragmatism

- Auto-Research requires explicit `--keep-warm-minutes` so warm idle spend is opt-in for research sessions.
- The runtime-spec guard compares local `tahuna.toml` state. If the remote environment is changed elsewhere, backend assignment still protects correctness, but the CLI guard only catches it after local state reflects the change.
- Warm-session billing is not research-aware yet. Budgets still use per-run duration estimates and observed run duration.

### Known Gaps

- Warm-session idle/billing time is not allocated into Auto-Research spend accounting.
- Backend idle timeout enforcement for compute sessions is still pending.
- Backend heartbeat timeout enforcement for compute sessions is still pending.
- Stale-session termination uses direct scheduling; retry/backoff semantics should be audited against existing run machine termination behavior.
- There is no user-facing compute session inspect/stop surface yet.

### Audit Prompt For The Next Agent

Use this prompt to audit the implementation:

```text
You are auditing Tahuna's warm-compute and Auto-Research integration.

Read:
- specs/autoresearch-local-mvp.md
- specs/Separate compute lifetime from run lifetime.md
- cli/research.go
- cli/commands_core.go
- web/convex/schema.ts
- web/convex/runs.ts
- web/convex/cli/research.ts
- web/components/features/dashboard/hillclimb-view.tsx
- web/convex/cli/shared.ts
- web/convex/computeSessions.ts
- web/convex/computeSessionAssignment.ts
- web/convex/environments.ts
- runtime/warden/internal/bootstrap/session.go
- runtime/warden/internal/config/config.go

Audit against this intended model:
- environments.activeComputeSessionId is the only canonical current warm-session link.
- tahuna train --warm and auto-research trial runs attach only through that link.
- no search/guesswork/fallback to arbitrary idle sessions.
- each run remains a distinct immutable execution with pinned manifests.
- code/data sync must not stale warm compute.
- runtime spec changes must clear activeComputeSessionId and terminate the old session.
- assignment must remain atomic and validate user, environment, run status, session status, active run exclusivity, provider machine ID, runtime token, and exact runtime spec.
- Warden session mode should run sequential assignments and return idle after each terminal run.
- Auto-Research should preserve the runtime spec across resumes and use warm=true only for trials after a warm baseline.

Pay special attention to:
- Auto-Research requires explicit --keep-warm-minutes and must not inherit train.keep_warm_after_minutes.
- whether remote environment changes can bypass the local runtime-spec guard.
- missing idle timeout enforcement.
- missing heartbeat timeout enforcement.
- warm-session billing/idle spend not allocated to Auto-Research.
- stale-session termination retry/backoff robustness.
- lack of user-facing compute session inspect/stop controls.

Produce findings first, ordered by severity, with file/line references and concrete reproduction or failure scenarios. Then list any tests that should be added.
```

The session state must record budget configuration and actual observed usage so the agent can reason about remaining budget without scraping human output.

## Training Output Contract

User training code does not need to import a Tahuna SDK for the MVP. It should print stable numeric metrics using `name=value` pairs.

Recommended output:

```text
step=100 train_loss=2.910000
step=200 train_loss=2.630000
step=200 val_bpb=1.480000
step=400 train_loss=2.410000
step=400 val_bpb=1.390000
val_bpb=1.370000
```

Guidelines:

- Print progress metrics at a stable interval, not every batch.
- Print validation/objective metrics at evaluation intervals.
- Print the final objective metric once near the end of training.
- Use `flush=True` or equivalent so logs stream promptly.
- Keep metric names stable across all trials.
- Make trial scale configurable through environment variables such as `TAHUNA_MAX_STEPS`, `TAHUNA_LOG_EVERY`, and `TAHUNA_EVAL_EVERY`.

Example:

```python
import os

max_steps = int(os.getenv("TAHUNA_MAX_STEPS", "1000"))
log_every = int(os.getenv("TAHUNA_LOG_EVERY", "50"))
eval_every = int(os.getenv("TAHUNA_EVAL_EVERY", "200"))

for step, batch in enumerate(loader, start=1):
    loss = train_step(batch)
    if step % log_every == 0:
        print(f"step={step} train_loss={loss:.6f}", flush=True)
    if step % eval_every == 0:
        val_bpb = evaluate()
        print(f"step={step} val_bpb={val_bpb:.6f}", flush=True)
    if step >= max_steps:
        break

final_val_bpb = evaluate()
print(f"val_bpb={final_val_bpb:.6f}", flush=True)
```

Tahuna should use progress metrics for logs and run inspection, but only the final objective metric determines accept/reject in the local MVP.

## Metric Contract

Research metrics are user-defined, but final value capture must be deterministic.

The MVP supports one metric source:

- Tahuna runtime metric: `--metric final:<name>`

External scorer commands such as `--metric-cmd` are outside the local MVP.

### Runtime Metric Source

Training code emits the objective as a normal Tahuna metric line:

```text
val_bpb=1.2345
```

The runtime already extracts `key=value` metrics from stdout and persists them as run runtime metrics. `tahuna research run` must read the final value only after the run is terminal.

Final value selection:

1. Filter metrics by `run_id`, metric `name`, and source `train` when available.
2. Prefer the sample with the highest numeric `step`.
3. Break step ties by newest timestamp.
4. If no sample exists, fail metric capture with `final metric <name> was not emitted`.

The command should treat missing final metrics as an `inconclusive` trial, not as an accepted or rejected result.

### Implemented API Support

The current CLI metric display reads recent metrics through the logs payload. That is acceptable for humans, but research needs a deterministic final metric lookup that cannot be truncated by a recent-metrics window.

Implemented CLI-facing endpoint:

```text
GET /api/runs/{run_id}/metrics/final?name=val_bpb
```

Response:

```json
{
  "run_id": "run_id",
  "name": "val_bpb",
  "value": 1.2345,
  "step": 999,
  "timestamp": 1234567890,
  "source": "train"
}
```

Error response:

```json
{
  "detail": "final metric val_bpb was not emitted"
}
```

Recommended schema support:

```ts
.index("by_run_and_name", ["runId", "name"])
```

The endpoint should query persisted `runRuntimeMetrics`, not the recent metrics window.

Research metadata sync is also implemented:

```text
POST /api/research/sessions/sync
```

This endpoint authenticates with the same CLI API key path as other CLI endpoints and upserts the session snapshot into `researchSessions` and `researchExperiments`.

### External Metric Command Source

External scorer commands are future work and remain outside the local MVP. If implemented later, Tahuna should invoke the metric command after the run reaches a terminal status.

Invocation:

```bash
./score_trial.sh \
  --run-id <run_id> \
  --session-id <session_id> \
  --trial <n>
```

The command prints JSON to stdout:

```json
{
  "name": "val_bpb",
  "value": 1.2345,
  "direction": "minimize"
}
```

Rules:

- `value` is required and must be finite.
- `name` is required for auditability.
- `direction` is optional if the CLI already has `--minimize` or `--maximize`.
- Non-zero exit marks the trial `inconclusive`.
- Invalid JSON marks the trial `inconclusive`.

This lets users score from run artifacts, external benchmarks, custom eval suites, or multiple Tahuna API calls without baking scorer logic into Tahuna.

## Patch and Revert Model

The local MVP relies on git for patch safety.

Before baseline:

- Record the starting commit.
- Record the initial working tree state.
- Refuse unexpected dirty files by default.

For each trial:

- Create a patch snapshot after the agent edit.
- Compute a patch hash.
- Validate changed files against `--editable`.
- On rejection or inconclusive result, restore the working tree to the incumbent state.
- On acceptance, update the incumbent patch snapshot.

Current implementation details:

- Dirty-file validation uses `git status --porcelain -- .` scoped to the current Tahuna project tree.
- Paths returned by git are normalized from repository-root paths to Tahuna project-relative paths before matching `--editable`.
- Patch snapshots use `git diff --binary HEAD -- .`.
- Untracked files are detected through `git ls-files --others --exclude-standard -- .`.
- Candidate patches with untracked files are rejected before launching a trial, because the tracked binary diff can be restored deterministically but untracked files are not yet stored as restorable patch material.
- Rejected and inconclusive tracked-file patches are removed with `git apply --whitespace=nowarn --reverse -`.
- The saved incumbent patch is restored with `git apply --whitespace=nowarn -`.
- Restore is verified by comparing the current worktree snapshot hash with the incumbent patch hash.

Future implementation can extend this to support untracked file materialization if needed.

Non-interactive git commands used by the implementation include:

- `git status --porcelain -- .`
- `git diff --binary`
- `git apply --reverse`
- `git apply`

The implementation must never discard user changes that predate the research session unless the user passed an explicit override.

## Session State

Persist state to:

```text
.tahuna/research/<session-id>.json
```

Shape:

```json
{
  "session_id": "research-20260526-153000",
  "created_at": "2026-05-26T15:30:00Z",
  "status": "awaiting_patch",
  "program": "program.md",
  "direction": "minimize",
  "metric": {
    "type": "final",
    "name": "val_bpb"
  },
  "editable": ["train.py"],
  "budget": {
    "max_trials": 20,
    "max_spend_usd": 50,
    "max_trial_minutes": 30,
    "stop_after_no_improvement": 5,
    "min_improvement": 0.01,
    "observed_spend_usd": 12.34
  },
  "baseline": {
    "run_id": "run_id",
    "status": "completed",
    "value": 1.42
  },
  "incumbent": {
    "trial": 3,
    "run_id": "run_id",
    "value": 1.31,
    "patch_sha256": "patch_hash"
  },
  "trials": [
    {
      "number": 1,
      "run_id": "run_id",
      "status": "rejected",
      "title": "increase warmup",
      "value": 1.51,
      "running_best": 1.42,
      "label": "rejected",
      "reason": "metric did not improve",
      "patch_sha256": "patch_hash",
      "estimated_spend_usd": 1.25,
      "observed_spend_usd": 1.19,
      "started_at": "2026-05-26T15:40:00Z",
      "completed_at": "2026-05-26T15:55:00Z"
    }
  ]
}
```

The file is the source of truth for local resume. Backend research metadata sync is best-effort and must not be required to resume an interrupted session.

## Backend Metadata Sync

The CLI syncs a compact research session snapshot to the backend after local session saves. This supports the Dashboard Hillclimb view without making the backend own the research loop.

Endpoint:

```text
POST /api/research/sessions/sync
Authorization: Bearer <TAHUNA_API_KEY>
```

Payload shape:

```json
{
  "session_id": "research-20260615-203958",
  "environment_id": "env_id",
  "status": "awaiting_patch",
  "program": "program.md",
  "metric_name": "eval_loss",
  "direction": "minimize",
  "budget": {
    "max_trials": 5,
    "max_spend_usd": 25,
    "max_trial_minutes": 30
  },
  "starting_commit": "git_sha",
  "created_at": "2026-06-15T20:39:58Z",
  "updated_at": "2026-06-15T21:10:00Z",
  "experiments": [
    {
      "kind": "baseline",
      "trial_number": 0,
      "run_id": "run_id",
      "status": "completed",
      "title": "baseline",
      "label": "accepted",
      "value": 0.574,
      "running_best": 0.574
    },
    {
      "kind": "trial",
      "trial_number": 1,
      "run_id": "run_id",
      "status": "accepted",
      "title": "faster learning rate",
      "label": "accepted",
      "reason": "metric improved incumbent",
      "value": 0.294,
      "running_best": 0.294,
      "patch_sha256": "patch_hash",
      "estimated_spend_usd": 1.25,
      "observed_spend_usd": 1.19,
      "started_at": "2026-06-15T20:50:00Z",
      "completed_at": "2026-06-15T21:03:00Z"
    }
  ]
}
```

Backend storage:

- `researchSessions` stores one row per user/session id.
- `researchExperiments` stores baseline and trial rows keyed by user/session/kind/trial number.
- Sync is idempotent: the CLI may send the full current snapshot repeatedly.
- Existing experiment rows missing from the latest snapshot are removed, so rolled-back local attempts do not remain visible.
- Run rows remain the source for ordinary run status, logs, artifacts, and emitted runtime metrics.
- Research metadata rows store only research context: title, verdict label, reason, value, running best, patch hash, timestamps, and spend.

Dashboard behavior:

- `listResearchSessions` reads synced research metadata first.
- `getResearchSession` reads synced experiment metadata first, then joins run rows and runtime metrics when run ids are present.
- If no synced metadata exists, the Dashboard falls back to parsing run names like `research-<session>-baseline` and `research-<session>-trial-N`.
- Synced `title` values are used as graph/table labels.
- Synced `label` values map to UI states: `accepted` -> kept, `rejected` -> discarded, `inconclusive` -> inconclusive.

## Status Values

Session status values:

- `running`: Tahuna is currently launching, polling, or scoring a run.
- `running_trial`: Tahuna has captured a candidate patch and is running a trial.
- `awaiting_patch`: Tahuna is waiting for the user's agent skill to edit allowed files and resume.
- `budget_exhausted`: no further trial can be launched within the configured budget.
- `failed`: Tahuna cannot safely continue.

Trial status values:

- `running`: Tahuna has created a trial record and may be syncing, launching, or monitoring a run.
- `accepted`: terminal run produced a valid metric and improved over the incumbent.
- `rejected`: terminal run produced a valid metric but did not improve.
- `inconclusive`: no valid decision could be made.
- `failed`: Tahuna failed before a run could be launched or tracked.

Run terminal status still comes from the normal Tahuna run lifecycle: `completed`, `failed`, or `cancelled`.

## Resume Behavior

Resume support is conservative:

```bash
tahuna research run --resume <session-id> --trial-title "faster learning rate"
```

Rules:

- Load the session file.
- Require session status `awaiting_patch`.
- Require a scored incumbent.
- Validate dirty project files against the session's `editable` allowlist.
- Scope git status, diff, and untracked checks to the current Tahuna project tree.
- Normalize monorepo-root git paths back to project-relative paths before matching `--editable`.
- Capture the current tracked diff as `trial-<N>.patch`.
- Persist the optional `--trial-title` as the trial's human-readable `title`.
- Reject an empty candidate patch.
- Reject untracked files before GPU spend.
- Continue at the next trial number.
- Sync code/data, launch `research-<session>-trial-<N>`, monitor the run, and resolve the final objective metric.
- Accept the patch if it improves the incumbent by at least `--min-improvement`.
- Restore the incumbent patch when the trial is rejected or inconclusive.
- Append the trial result and return to `awaiting_patch`.

## CLI Output

Default output is human-readable:

```text
Research session: research-20260526-153000
Metric: val_bpb (minimize)

Baseline:
  run: research-20260526-153000-baseline
  final val_bpb: 1.4200

Trial 1:
  patch: 8 files changed
  run: research-20260526-153000-trial-1
  final val_bpb: 1.5100
  verdict: rejected

Trial 2:
  patch: 2 files changed
  run: research-20260526-153000-trial-2
  final val_bpb: 1.3100
  verdict: accepted
```

`--verbose` should print the session JSON.

## Progress Graph

Tahuna must render a local progress graph for a research session.

Command:

```bash
tahuna research graph <session-id> \
  --output .tahuna/research/<session-id>/progress.svg
```

Default behavior:

- Write SVG by default for portability.
- Default `--output` to `.tahuna/research/<session-id>/progress.svg`.
- Support PNG later if the CLI has a stable renderer available.
- Use the session objective metric.
- Include baseline as experiment `0`.
- Plot every completed experiment on the x-axis by experiment number.
- Plot final objective/loss on the y-axis.
- For minimize metrics, lower values are better.
- For maximize metrics, higher values are better.

Required visual encoding:

- Rejected trials: distinct rejected markers.
- Accepted improvements: green points.
- Baseline: point labeled `baseline`.
- Running best: distinct line.
- Inconclusive/failed trials: distinct inconclusive markers, including trials without values when they can be placed against the current running best.

The main progress graph is cross-experiment: one point per baseline or trial using the final objective value. Per-step training losses such as `train_loss` may be stored and rendered in a separate run detail view later, but they should not replace the cross-experiment objective graph.

Title format:

```text
Autoresearch Progress: 83 Experiments, 15 Kept Improvements
```

Axis labels:

```text
Experiment #
Validation BPB (lower is better)
```

The y-axis label should be derived from the metric name and direction. For example:

- `val_bpb` + minimize -> `Validation BPB (lower is better)`
- `reward` + maximize -> `Reward (higher is better)`
- unknown metric -> `<metric> (lower|higher is better)`

The graph should be regenerated after every trial so the user and agent can inspect progress without parsing JSON.

## Dashboard Hillclimb View

The Dashboard also renders cross-experiment research progress in the authenticated UI.

Route:

```text
/dashboard?view=hillclimb
```

Data source:

- Prefer synced `researchSessions` and `researchExperiments` rows.
- Join ordinary `runs` rows when `runId` is available.
- Read runtime metrics from `runRuntimeMetrics` for latest/final values.
- Fall back to run-name parsing for older sessions without synced metadata.

View behavior:

- Sidebar nav item is `Hillclimb`.
- Session selector uses `session_id`.
- Objective metric selector uses the objective metric name from synced metadata when available; otherwise it falls back to inferred runtime metrics.
- The graph plots one point per baseline/trial and a running-best step line.
- Experiment labels use synced `title` values when present; otherwise they fall back to `baseline` or `trial N`.
- Table rows show experiment title, run id, kept/discarded/inconclusive state, latest value, final value, and running best.
- The chart uses a dark purple running-best/kept color and muted grey discarded points.

## Validation and Acceptance Criteria

The local MVP is complete when:

- `tahuna research run` creates a baseline run and at least one trial run.
- `tahuna research run` can exit with `awaiting_patch` after baseline and continue with `--resume <session-id>` after the user's agent edits code.
- Trial runs use the normal Tahuna training path.
- Users can define an objective through `--metric final:<name>`.
- Final runtime metrics are captured after terminal run status from persisted metrics, not from a recent metrics window.
- Missing or invalid final metrics produce `inconclusive`.
- Budget limits are checked before launching each GPU run and recorded in session state.
- Rejected and inconclusive patches are reverted.
- Accepted patches remain in the working tree.
- `.tahuna/research/<session-id>.json` records baseline, trials, verdicts, metric values, and run IDs.
- Backend metadata sync records session and experiment summaries for the Dashboard when authenticated API sync is available.
- `tahuna research graph <session-id>` renders a progress graph with discarded trials, kept improvements, and running best.
- `/dashboard?view=hillclimb` renders synced experiment titles, final/latest values, verdicts, and running best.
- `--resume` can continue a session only when dirty project files are allowed by the session and the resulting accept/reject restore path is deterministic.

## Implementation Order

1. Done: add final-metric lookup API/query over persisted `runRuntimeMetrics`.
2. Done: add CLI metric resolver for `final:<name>`.
3. Done: add CLI session state writer under `.tahuna/research/`.
4. Done: add baseline run orchestration.
5. Done: add editable path validation for patches produced by the user's external agent skill.
6. Done: add conservative `--resume` session loading and preflight.
7. Done: add trial launch, metric capture, comparison, accept/reject/inconclusive verdicts, and tracked patch restore.
8. Done: scope research git status/diff/untracked checks to the current Tahuna project tree, including projects nested inside a larger git repository.
9. Done: add budget checks before every GPU run, including `--max-trials`, `--max-spend-usd`, `--max-trial-minutes`, `--stop-after-no-improvement`, and `--min-improvement` enforcement.
10. Done: add run cancellation when `--max-trial-minutes` is exceeded.
11. Done: record observed spend and estimated spend in session state.
12. Done: add SVG progress graph rendering.
13. Done: update CLI docs and record the external `tahuna-autoresearch-project` agent skill checklist.
14. Done: add best-effort backend research metadata sync with `researchSessions`, `researchExperiments`, and `POST /api/research/sessions/sync`.
15. Done: add Dashboard Hillclimb rendering from synced metadata with run-name fallback.
16. Done: add optional `--trial-title` labels for Dashboard graph/table readability.
17. Out of MVP scope: add `--metric-cmd` scoring after terminal run status.
