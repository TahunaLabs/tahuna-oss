# Spec: Separate Compute Lifetime From Run Lifetime

## Scope

Tahuna training runs are currently one execution on one ephemeral machine. That is correct for normal `tahuna train`, but it is inefficient for research loops where the user repeatedly changes code, syncs again, and launches another candidate run.

This spec introduces a separate compute session lifetime. A compute session owns the provider machine. A run remains one immutable recorded execution with its own pinned code/data manifests, logs, metrics, artifacts, status, and billing attribution.

## Goals

- Reuse one provisioned machine for multiple sequential training runs.
- Preserve one run record per candidate execution.
- Keep run outputs, logs, metrics, artifacts, and terminal status isolated per run.
- Allow the CLI and autoresearch harness to sync code again, create a new run, and execute it on warm compute.
- Keep the user mental model run-first: warm compute is an extension of `tahuna train`, not a separate thing users must create before they can train.
- Terminate warm compute explicitly or after a configured idle timeout.
- Keep the existing one-shot run path available as the default behavior.

## Non-Goals

- No concurrent runs on the same compute session.
- No implicit reuse of arbitrary active machines.
- No hidden fallback from warm compute to ephemeral compute.
- No mutation of an existing terminal run to represent a new execution.
- No reuse when GPU type, GPU count, volume size, framework image, or Python version differ.

## Terms

| Term | Meaning |
|------|---------|
| Run | One training execution. It is immutable after terminal status. |
| Compute session | Long-lived Tahuna-owned compute lease that can execute multiple sequential runs. |
| Assignment | The act of binding one queued run to one idle compute session. |
| Runtime daemon | Warden mode that stays alive on the machine, waits for assignments, executes one run at a time, then returns to idle. |

## CLI Mental Model

The primary user story stays centered on training:

```
tahuna init .
tahuna sync
tahuna train --keep-warm 10m
```

What happens:

1. Tahuna creates a new run.
2. Tahuna provisions compute that can become warm compute after the run.
3. The run executes normally and records its own run ID, logs, metrics, artifacts, manifests, and terminal status.
4. After the run finishes, the runtime daemon returns the machine to an idle compute session for 10 minutes.
5. The CLI prints:

```
Run completed.
Compute is warm for 10m.

Next run:
  tahuna sync
  tahuna train --warm
```

The iteration loop becomes:

```
# edit code
tahuna sync
tahuna train --warm

# edit again
tahuna sync
tahuna train --warm
```

`tahuna train --warm` always creates a new run and assigns it to an existing idle compatible compute session for the current environment. If no compatible warm session exists, it fails clearly and does not silently fall back to ephemeral provisioning.

`tahuna init .` may store a default warm-compute preference in local project config:

```
Keep compute warm after training runs?
  No
  Yes, 10 minutes
  Custom
```

If the project config contains `train.keep_warm_after_seconds = 600`, then:

```
tahuna train
```

behaves like:

```
tahuna train --keep-warm 10m
```

Users can override the default for a single run:

```
tahuna train --no-keep-warm
tahuna train --keep-warm 30m
```

Power-user compute management commands can exist later for inspection or cleanup, but they are not the primary path and should not be required for the first warm-compute workflow.

## Data Model

### `computeSessions`

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Owner |
| `environmentId` | id | Parent environment |
| `status` | enum | `provisioning`, `idle`, `running`, `terminating`, `terminated`, `failed` |
| `providerMachineId` | string? | Provider-native machine identifier |
| `runtimeTokenHash` | string | Token for session daemon callbacks |
| `activeRunId` | id? | Current run assigned to this session |
| `effectiveGpuType` | string | Machine GPU type |
| `effectiveGpuCount` | number | Machine GPU count |
| `effectiveVolumeGb` | number | Machine volume size |
| `framework` | string | Runtime framework |
| `frameworkVersion` | string | Runtime framework version |
| `pythonVersion` | string | Runtime Python version |
| `imageName` | string | Resolved runtime image |
| `idleTimeoutSeconds` | number | Time to keep compute alive after becoming idle |
| `lastHeartbeatAt` | number? | Last daemon heartbeat time |
| `lastIdleAt` | number? | Time the session most recently became idle |
| `createdAt` | number | Creation timestamp |
| `terminatedAt` | number? | Terminal timestamp |
| `error` | string? | Failure detail |

### `runs`

Add fields:

| Field | Type | Description |
|-------|------|-------------|
| `computeSessionId` | id? | Session used for this run, when warm compute is used |
| `executionMode` | enum | `ephemeral` or `session` |

Keep existing run fields canonical. `providerMachineId` can remain on runs for read compatibility and audit denormalization, but compute ownership belongs to `computeSessions`.

## Lifecycles

### Compute Session

```
provisioning -> idle -> running -> idle -> terminating -> terminated
                    |        |
                    |        +-> failed
                    +----------> terminating
```

Rules:

- `provisioning`: backend creates the provider machine and starts Warden in session mode.
- `idle`: daemon is ready and no run is assigned.
- `running`: exactly one run is assigned and executing.
- `terminating`: user stopped the session, idle timeout expired, heartbeat timeout fired, or terminal failure requires cleanup.
- `terminated`: provider machine is gone.
- `failed`: daemon or provider setup failed before the session became usable.

### Run On Compute Session

```
queued -> provisioning -> running -> completed
                          |       -> failed
                          |       -> cancelling -> cancelled
```

The run lifecycle stays the same from the user's perspective. The difference is that `provisioning` means "assigned to a ready compute session and materializing this run's pinned snapshot" instead of "creating a new provider machine".

## Runtime Contract

Warden gets a new session mode.

1. Start once on the provider machine with `TAHUNA_COMPUTE_SESSION_ID`.
2. Emit session heartbeat.
3. Poll or long-poll for the next assignment.
4. Fetch the run bootstrap plan for the assigned `runId`.
5. Materialize the run's pinned code/data manifests into the workspace.
6. Install dependencies when the dependency fingerprint changed.
7. Execute the run command.
8. Emit logs, metrics, artifacts, and terminal status to that run's runtime endpoints.
9. Report assignment complete to the compute session endpoint.
10. Return to idle and wait for the next assignment.

There is no fallback path inside Warden. If an assignment cannot be prepared or executed, that run becomes `failed` and the session either returns to `idle` or becomes `failed` based on whether the daemon itself is still healthy.

## API And CLI

### CLI Surface

```
tahuna train
tahuna train --keep-warm <duration>
tahuna train --warm
tahuna train --no-keep-warm
```

`tahuna train` remains ephemeral by default unless the project config contains a keep-warm default from `tahuna init .`. Warm reuse remains explicit through either a stored keep-warm preference, `--keep-warm`, or `--warm`.

Duration syntax accepts minute/second forms such as `10m`, `30m`, `1min`, `60s`, and `1h`.

### Backend Operations

- Create compute session as part of a keep-warm training run.
- Stop compute session.
- List compute sessions.
- Resolve the current environment's compatible idle session for `tahuna train --warm`.
- Assign queued run to idle compute session.
- Complete assignment and release session to idle.
- Enforce idle timeout.
- Enforce heartbeat timeout.

## Assignment Rules

A run can be assigned to a compute session only when all are true:

- Same user.
- Same environment.
- Session status is `idle`.
- Run status is `queued`.
- GPU type, GPU count, volume size, image name, framework, framework version, and Python version match.
- Session has no `activeRunId`.

If any rule fails, the API returns a structured validation error. It does not create a second machine and does not silently fall back to ephemeral provisioning.

## Run-Level Assignment Slice

The first implementation slice after the backend foundation is run-level assignment. It must not implement Warden session mode, CLI commands, or research flags in the same commit.

### Scope

- Create a queued run with `executionMode = "session"` and `computeSessionId`.
- Validate that the requested compute session can execute the run.
- Assign the run to the compute session without provisioning a new provider machine.
- Record the assignment in run events and compute session events.

### Required Code Changes

1. Extend run response shaping.
   - Add `compute_session_id` and `execution_mode` to run API responses.
   - Keep empty string or `ephemeral` defaults for existing runs.

2. Extend run creation internals.
   - Add an internal create path that accepts `computeSessionId`.
   - It must create the run with `enqueue_provisioning = false`.
   - It must set `executionMode = "session"` and `computeSessionId` on the run row.
   - Existing one-shot run creation must keep `executionMode = "ephemeral"` or equivalent default behavior.

3. Add assignment validation.
   - Load the run and compute session in one mutation.
   - Validate same user and same environment.
   - Validate compute session status is `idle`.
   - Validate run status is `queued`.
   - Validate session has no `activeRunId`.
   - Validate effective GPU type/count, volume size, framework, framework version, Python version, and image name match.

4. Apply assignment atomically.
   - Patch the run to `status = "provisioning"` and `providerMachineId = computeSession.providerMachineId`.
   - Keep the run's pinned code/data manifests unchanged.
   - Transition compute session `idle -> running`.
   - Set `computeSessions.activeRunId = runId`.
   - Insert a run event such as `run assigned to compute session`.

5. Add tests at the backend seam.
   - Assignment succeeds for an idle matching session.
   - Assignment rejects mismatched environment.
   - Assignment rejects non-idle session.
   - Assignment rejects GPU/image/runtime mismatch.
   - Assignment does not enqueue a provider provisioning job.

### Out Of Scope For This Slice

- No Warden polling or execution loop.
- No runtime session endpoints.
- No `tahuna compute` CLI commands.
- No `tahuna research run --compute-session`.
- No idle timeout enforcement.
- No billing allocation changes.

## Sync And Snapshots

Run creation still pins manifests from the environment at creation time.

The CLI loop is:

1. User edits code.
2. CLI syncs code/data.
3. Backend creates a new run with the latest manifest hashes.
4. Backend assigns that run to the current environment's compatible idle compute session when `--warm` is used.
5. Warden materializes that run's pinned snapshot and executes it.

The compute session never decides what code is current. The run record owns the snapshot.

## Billing

Compute session billing is based on machine lifetime, not individual run duration.

Each run records its own execution duration and artifacts for audit, but the billable provider lease belongs to the compute session. Run-level cost display should allocate session cost by one explicit policy:

- MVP policy: show session-level spend only, and show per-run execution duration without allocated cost.
- Later policy: allocate session cost across runs by runtime plus idle time attribution.

No hidden free idle window. If the session is alive, the user is spending compute credits.

## Termination

A compute session terminates when:

- User runs `tahuna compute stop`.
- User runs a future explicit stop command or the dashboard equivalent.
- Idle timeout expires.
- Heartbeat timeout expires.
- Provider termination is required after unrecoverable daemon failure.
- Force cancellation requests immediate cleanup.

Run completion alone does not terminate the machine in session mode.

## Implementation Slices

1. Add `computeSessions` schema, lifecycle planner, and backend create/list/stop operations.
2. Add run-level assignment API and response shaping.
3. Add `tahuna init .` keep-warm preference in `tahuna.toml`.
4. Add `tahuna train --keep-warm`, `--warm`, and `--no-keep-warm` CLI flags.
5. Add backend keep-warm run creation that provisions Warden in session mode and assigns the first run.
6. Add Warden session mode with heartbeat, assignment polling, per-run execution, and return-to-idle.
7. Add idle timeout and heartbeat timeout enforcement.
8. Wire autoresearch to reuse warm compute through the train-owned surface.
9. Update billing display for session-level spend.

## Acceptance Criteria

- A user can run `tahuna train --keep-warm 10m`, edit code, sync, and run `tahuna train --warm` on the same provider machine.
- A project with `train.keep_warm_after_seconds = 600` treats plain `tahuna train` as keep-warm unless `--no-keep-warm` is passed.
- Each run has distinct run ID, manifest hashes, logs, metrics, artifacts, and terminal status.
- The provider machine ID is the same for both runs.
- The session remains idle after a successful run until stopped or timed out.
- A mismatched run/session assignment fails before execution.
- Terminal run status never mutates into a new execution.
