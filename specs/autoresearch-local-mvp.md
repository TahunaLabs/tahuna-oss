# Tahuna Autoresearch Local MVP

Last reviewed: 2026-05-26

Linear: TAH-318

## Goal

Add a local `tahuna research run` workflow that proves Karpathy-style autoresearch on top of Tahuna's existing training primitives.

The local MVP keeps the research controller on the user's machine. Tahuna continues to own the expensive and observable part of the loop: syncing code/data, launching GPU training runs, ingesting logs/metrics, uploading artifacts, and tracking run state.

The user's local agent owns code edits through a Tahuna autoresearch skill. The Tahuna CLI must not configure or launch a coding agent. It exposes deterministic research primitives the agent can call.

Reference: <https://github.com/karpathy/autoresearch>

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
   - Validate with `make validate-cli`.

6. **Budgets and cancellation**
   - Enforce `--max-trials`, `--max-spend-usd`, `--max-trial-minutes`, `--stop-after-no-improvement`, and `--min-improvement`.
   - Estimate spend from GPU catalog, effective run compute, observed baseline duration, and current elapsed run time.
   - Cancel or mark trials inconclusive when `--max-trial-minutes` is exceeded.
   - Validate with `make validate-cli`.

7. **External scorer**
   - Add `--metric-cmd`, invoke it after terminal run status, parse scorer JSON, and mark non-zero or invalid output inconclusive.
   - Validate with `make validate-cli`.

8. **Progress graph**
   - Implement `tahuna research graph <session-id> --output <path>` as local SVG rendering from session state.
   - Plot baseline, accepted/rejected/inconclusive trials, and running best.
   - Validate with `make validate-cli`.

9. **Docs and agent skill follow-up**
   - Update CLI docs and the external `tahuna-autoresearch-project` agent skill after the CLI harness is usable.
   - Keep Tahuna CLI as a harness only; it must not launch or configure an agent.

## Non-Goals

- No cloud-hosted coding agent in the MVP.
- No CLI flags for selecting a coding agent.
- No backend scheduler for the research loop in the MVP.
- No new GPU runtime mode for research.
- No automatic edits outside an explicit user allowlist.
- No multi-objective optimizer in the first implementation.

## User-Facing Command

```bash
tahuna research run \
  --program program.md \
  --metric final:val_bpb \
  --minimize \
  --max-trials 20 \
  --max-spend-usd 50 \
  --max-trial-minutes 30 \
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

External scorer form:

```bash
tahuna research run \
  --program program.md \
  --metric-cmd ./score_trial.sh \
  --minimize \
  --max-trials 20 \
  --max-spend-usd 50 \
  --editable train.py
```

Progress graph:

```bash
tahuna research graph <session-id> \
  --output .tahuna/research/<session-id>/progress.svg
```

## Execution Model

`tahuna research run` is safe for a user agent skill to call repeatedly. It must not invoke an agent itself.

New session behavior:

- Create the session.
- Run and score the baseline.
- If no candidate patch is present, write session status `awaiting_patch`, print the next trial number, and exit successfully.

Resume behavior:

- The agent skill edits allowed files.
- The agent calls `tahuna research run --resume <session-id>`.
- Tahuna validates the current patch, launches the next trial, records the verdict, restores or keeps the patch, regenerates the graph, and exits.
- If more trials remain, Tahuna prints whether the next step is `awaiting_patch` or `budget_exhausted`.

This gives the user's agent the control loop without making Tahuna an agent launcher.

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
   - The progress graph shows all experiments, discarded trials, kept improvements, and the running best line.
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
- Calling Tahuna commands between edits.
- Stopping when Tahuna reports that budgets are exhausted.

This keeps Tahuna as the research harness rather than an agent runner.

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

Tahuna should use progress metrics for logs and graphs, but only the final objective metric determines accept/reject unless the user explicitly chooses another scorer.

## Metric Contract

Research metrics are user-defined, but final value capture must be deterministic.

The MVP supports two metric sources:

- Tahuna runtime metric: `--metric final:<name>`
- External metric command: `--metric-cmd <command>`

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

### Required API Support

The current CLI metric display reads recent metrics through the logs payload. That is acceptable for humans, but research needs a deterministic final metric lookup that cannot be truncated by a recent-metrics window.

Add a narrow CLI-facing endpoint or equivalent Convex query:

```text
GET /runs/:run_id/metrics/final?name=val_bpb
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

### External Metric Command Source

For custom scoring, Tahuna invokes the metric command after the run reaches a terminal status.

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

The first implementation can use non-interactive git commands:

- `git diff --name-only`
- `git diff --binary`
- `git apply --reverse`
- `git checkout-index` or equivalent restore logic

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
      "value": 1.51,
      "running_best": 1.42,
      "label": "increase warmup",
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

The file should be append-friendly so an interrupted session can be inspected or resumed later.

## Status Values

Session status values:

- `running`: Tahuna is currently launching, polling, or scoring a run.
- `awaiting_patch`: Tahuna is waiting for the user's agent skill to edit allowed files and resume.
- `budget_exhausted`: no further trial can be launched within the configured budget.
- `completed`: the trial budget is exhausted or the user stopped the session cleanly.
- `failed`: Tahuna cannot safely continue.

Trial status values:

- `accepted`: terminal run produced a valid metric and improved over the incumbent.
- `rejected`: terminal run produced a valid metric but did not improve.
- `inconclusive`: no valid decision could be made.
- `failed`: Tahuna failed before a run could be launched or tracked.

Run terminal status still comes from the normal Tahuna run lifecycle: `completed`, `failed`, or `cancelled`.

## Resume Behavior

Initial resume support should be conservative:

```bash
tahuna research run --resume <session-id>
```

Rules:

- Load the session file.
- Verify the current working tree matches the incumbent patch snapshot.
- Continue at the next trial number.
- Refuse to resume if unexpected files changed.

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
- Support PNG later if the CLI has a stable renderer available.
- Use the session objective metric unless `--metric <name>` is passed.
- Include baseline as experiment `0`.
- Plot every completed experiment on the x-axis by experiment number.
- Plot final objective/loss on the y-axis.
- For minimize metrics, lower values are better.
- For maximize metrics, higher values are better.

Required visual encoding:

- Discarded/rejected trials: light gray points.
- Kept/accepted improvements: green points.
- Baseline: green point labeled `baseline`.
- Running best: green step line.
- Inconclusive/failed trials: muted hollow points or omitted from the objective line, with counts in the title.
- Labels on accepted improvements from trial `label`, patch summary, or first line of the agent's hypothesis.

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

## Validation and Acceptance Criteria

The local MVP is complete when:

- `tahuna research run` creates a baseline run and at least one trial run.
- `tahuna research run` can exit with `awaiting_patch` after baseline and continue with `--resume <session-id>` after the user's agent edits code.
- Trial runs use the normal Tahuna training path.
- Users can define an objective through `--metric final:<name>` or `--metric-cmd`.
- Final runtime metrics are captured after terminal run status from persisted metrics, not from a recent metrics window.
- Missing or invalid final metrics produce `inconclusive`.
- Budget limits are checked before launching each GPU run and recorded in session state.
- Rejected and inconclusive patches are reverted.
- Accepted patches remain in the working tree.
- `.tahuna/research/<session-id>.json` records baseline, trials, verdicts, metric values, and run IDs.
- `tahuna research graph <session-id>` renders a progress graph with discarded trials, kept improvements, and running best.
- `--resume` can continue a session only when the working tree matches the incumbent.

## Implementation Order

1. Add final-metric lookup API/query over persisted `runRuntimeMetrics`.
2. Add CLI metric resolver for `final:<name>`.
3. Add CLI session state writer under `.tahuna/research/`.
4. Add baseline run orchestration.
5. Add editable path validation for patches produced by the user's external agent skill.
6. Add trial launch, metric capture, comparison, and patch restore.
7. Add `--metric-cmd`.
8. Add budget checks and observed spend recording.
9. Add SVG progress graph rendering.
10. Add conservative `--resume`.
