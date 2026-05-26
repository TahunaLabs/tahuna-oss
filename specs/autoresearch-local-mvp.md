# Tahuna Autoresearch Local MVP

Last reviewed: 2026-05-26

Linear: TAH-318

## Goal

Add a local `tahuna research run` workflow that proves Karpathy-style autoresearch on top of Tahuna's existing training primitives.

The local MVP keeps the research controller on the user's machine. Tahuna continues to own the expensive and observable part of the loop: syncing code/data, launching GPU training runs, ingesting logs/metrics, uploading artifacts, and tracking run state.

Reference: <https://github.com/karpathy/autoresearch>

## Non-Goals

- No cloud-hosted coding agent in the MVP.
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
  --editable train.py \
  --agent "codex exec"
```

Equivalent maximize form:

```bash
tahuna research run \
  --program program.md \
  --metric final:reward \
  --maximize \
  --max-trials 20 \
  --editable "src/training/**" \
  --agent "claude -p"
```

External scorer form:

```bash
tahuna research run \
  --program program.md \
  --metric-cmd ./score_trial.sh \
  --minimize \
  --max-trials 20 \
  --editable train.py
```

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

4. Start trial `N`.
   - Give the local coding agent the program, prior trial summaries, current incumbent metric, and editable allowlist.
   - Agent makes one coherent candidate patch.
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
   - Continue until `--max-trials`, wall time, or spend budget is exhausted.

7. Finish.
   - The working tree contains the best accepted patch.
   - The session file contains the full audit trail.
   - Human output prints baseline, incumbent, each trial value, and final recommendation.

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

## Agent Contract

The local agent is pluggable:

```bash
--agent "codex exec"
--agent "claude -p"
--agent-cmd "./research_agent.sh"
```

Tahuna gives the agent:

- Path to `program.md`.
- The current incumbent metric and trial number.
- Baseline and prior trial summaries.
- The editable allowlist.
- A directive to produce one coherent candidate patch.

Tahuna, not the agent, enforces the allowlist with git diff checks.

If the agent exits non-zero, produces no diff, or edits disallowed files, the trial is recorded as `inconclusive` and the working tree is restored to the incumbent patch.

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
  "program": "program.md",
  "direction": "minimize",
  "metric": {
    "type": "final",
    "name": "val_bpb"
  },
  "editable": ["train.py"],
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
      "reason": "metric did not improve",
      "patch_sha256": "patch_hash",
      "started_at": "2026-05-26T15:40:00Z",
      "completed_at": "2026-05-26T15:55:00Z"
    }
  ]
}
```

The file should be append-friendly so an interrupted session can be inspected or resumed later.

## Status Values

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

## Validation and Acceptance Criteria

The local MVP is complete when:

- `tahuna research run` creates a baseline run and at least one trial run.
- Trial runs use the normal Tahuna training path.
- Users can define an objective through `--metric final:<name>` or `--metric-cmd`.
- Final runtime metrics are captured after terminal run status from persisted metrics, not from a recent metrics window.
- Missing or invalid final metrics produce `inconclusive`.
- Rejected and inconclusive patches are reverted.
- Accepted patches remain in the working tree.
- `.tahuna/research/<session-id>.json` records baseline, trials, verdicts, metric values, and run IDs.
- `--resume` can continue a session only when the working tree matches the incumbent.

## Implementation Order

1. Add final-metric lookup API/query over persisted `runRuntimeMetrics`.
2. Add CLI metric resolver for `final:<name>`.
3. Add CLI session state writer under `.tahuna/research/`.
4. Add baseline run orchestration.
5. Add local agent invocation and editable path validation.
6. Add trial launch, metric capture, comparison, and patch restore.
7. Add `--metric-cmd`.
8. Add conservative `--resume`.
