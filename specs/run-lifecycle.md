# Spec: Run Lifecycle & Training

## Scope

A run is a single training execution on a provisioned GPU pod. Runs are created from an environment, pinned to specific code/data versions, and progress through a defined state machine until completion, failure, or cancellation.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Run record | Convex table row | `runs` table entry |
| Run events | Convex table rows | `runEvents` — immutable audit log of state transitions |
| Run logs | Convex table rows | `runRuntimeLogs` — stdout/stderr from pod |
| Run metrics | Convex table rows | `runRuntimeMetrics` — extracted training metrics |
| Runtime token | Credential | One-time bearer token for pod -> backend communication |
| Pod | Runpod resource | GPU compute instance running the training |
| Artifacts | R2 objects | Training outputs uploaded from pod |

### Run Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Owner |
| `environmentId` | string | Parent environment |
| `name` | string | User-facing run name (word-based random default if omitted) |
| `status` | enum | Current state (see state machine) |
| `error` | string? | Error message if failed |
| `podId` | string? | Runpod pod identifier |
| `effectiveGpuType` | string | Actual GPU used (may differ from env default) |
| `effectiveGpuCount` | number | Actual GPU count used |
| `effectiveVolumeGb` | number | Actual volume size used |
| `codeManifestHash` | string | Pinned code version at creation |
| `dataManifestHash` | string? | Pinned data version at creation |
| `runtimeTokenHash` | string | SHA256 of pod runtime token |
| `artifactKeys` | string[]? | R2 keys of uploaded artifacts |
| `cancellationRequested` | boolean | Whether user requested cancellation |

## State Machine

```
                          +-----------+
                          |  QUEUED   |
                          +-----+-----+
                                |
                    +-----------+-----------+
                    |                       |
              (capacity ok)          (no capacity)
                    |                       |
                    v                       v
             +------+------+         +------+------+
             |PROVISIONING |         |   FAILED    |
             +------+------+         +-------------+
                    |                 (or: prompt user
                    |                  for alt GPU,
              (pod ready)              retry from QUEUED)
                    |
                    v
             +------+------+
             |   RUNNING   |
             +------+------+
                    |
          +---------+---------+
          |         |         |
    (exit 0)  (exit != 0)  (cancel)
          |         |         |
          v         v         v
    +-----+--+ +---+----+ +--+--------+
    |COMPLETED| | FAILED | |CANCELLING|
    +---------+ +--------+ +-----+----+
                                 |
                           (graceful stop
                            or --force)
                                 |
                                 v
                          +------+-----+
                          | CANCELLED  |
                          +------------+
```

### State Definitions

| State | Description | Terminal? |
|-------|-------------|-----------|
| `queued` | Run record created, waiting for provisioning | No |
| `provisioning` | Pod creation requested to Runpod | No |
| `running` | Pod is executing the training entrypoint | No |
| `cancelling` | Cancellation requested, waiting for graceful shutdown | No |
| `completed` | Entrypoint exited with code 0, artifacts uploaded | Yes |
| `failed` | Entrypoint exited non-zero, or provisioning/bootstrap error | Yes |
| `cancelled` | User-initiated cancellation completed | Yes |

### Valid Transitions

| From | To | Trigger |
|------|----|---------|
| `queued` | `provisioning` | Pod creation initiated |
| `queued` | `cancelled` | User cancels before provisioning |
| `queued` | `failed` | No capacity and no retry |
| `provisioning` | `running` | Pod reports bootstrap complete |
| `provisioning` | `failed` | Pod creation or bootstrap fails |
| `running` | `completed` | Entrypoint exits 0 + artifacts uploaded |
| `running` | `failed` | Entrypoint exits non-zero |
| `running` | `cancelling` | User requests cancellation |
| `cancelling` | `cancelled` | Graceful shutdown completes or force timeout |

## Lifecycle

### Run Creation (`tahuna train` / `tahuna run create`)

```
1. PREFLIGHT SYNC
   - Auto-sync code + data (see sync spec)
   - If environment has no synced code: ERROR

2. BUILD RUN PAYLOAD
   - Pin codeManifestHash from environment.latestCodeManifestHash
   - Pin dataManifestHash from environment.latestDataManifestHash
   - Set run name from `--name` when provided
   - If name not provided: generate word-based random name (for example `warm-river-fox`)
   - Apply GPU overrides from --gpu-type, --gpu-count, --volume-gb
     (fall back to environment defaults)
   - Validate overrides against GPU catalog guardrails

3. CREATE RUN RECORD
   - POST /api/environments/{env_id}/runs
   - Backend creates run in QUEUED state
   - Generates runtime token (random, stored as SHA256 hash)

4. PROVISION POD
   - Backend calls Runpod API to create pod
   - If success: transition to PROVISIONING, store podId
   - If no capacity:
     a. Roll back run record (delete it)
     b. Return 409 to CLI
     c. CLI (interactive mode): prompt user to pick alternate GPU
     d. Retry from step 2 with new GPU type

5. MONITOR (foreground mode)
   - Poll GET /api/runs/{run_id} at interval from shared config (`RUN_STATUS_POLL_SECONDS`)
   - Display status panel with live updates
   - Continue until terminal state reached

   OR

5b. DETACH (tahuna train -d)
   - Print run ID and exit
```

### No-Capacity Handling

```
CLI receives 409 (no capacity):
  |
  |-- Non-interactive terminal: print error and exit
  |
  |-- Interactive terminal:
       |-- Fetch GPU catalog (GET /api/catalog)
       |-- Display available GPUs with pricing
       |-- Prompt: "Select alternate GPU or [q]uit"
       |-- If user selects: retry run creation with new GPU
       |-- If user quits: exit
```

### Queuing (future)

- When no capacity is available, user can opt to enter a queue.
- Queue position is displayed in CLI and dashboard.
- When capacity becomes available, run transitions from `queued` to `provisioning` automatically.
- Queue timeout is configured in shared config (`RUN_QUEUE_TIMEOUT_SECONDS`). Run fails if not provisioned within timeout.

### Cancellation

```
tahuna run cancel <run_id> [--force/-f]:
  |
  |-- If --force: immediate pod termination, no artifact save
  |
  |-- If no --force (default):
       |-- Prompt: "Cancel run <id>? This will attempt graceful shutdown. [y/N]"
       |-- If confirmed:
            |-- Set cancellationRequested = true
            |-- Transition to CANCELLING
            |-- Pod receives SIGTERM
            |-- Queue checkpoint/save request (non-blocking)
            |-- Wait up to configured grace window from shared config
            |-- After grace window: force terminate pod
            |-- Upload any artifacts already flushed to output directory
            |-- Transition to CANCELLED
```

### Rename

```
tahuna run rename <id|name> --name <new-name>:
  |
  |-- Resolve run by ID or exact current name
  |-- Validate new name (user-scoped uniqueness for active runs)
  |-- PATCH /api/runs/{run_id}
  |-- Emit run event: RENAMED (old_name -> new_name)
```

### Metric Extraction

Two modes (tried in order):

1. **Tahuna tracking SDK (future)**: `import tahuna_track as wandb`
   - Drop-in replacement for wandb Python package
   - Logs metrics directly to backend via runtime token
   - Supports: `wandb.log()`, `wandb.init()`, `wandb.finish()`

2. **Stdout regex fallback**: Parse training output for `NAME=VALUE` patterns
   - Pattern: `(\w+)=([\d.]+(?:e[+-]?\d+)?)`
   - Example: `loss=0.42 accuracy=0.95` extracts two metrics
   - Metrics posted to `POST /api/runs/{run_id}/runtime/metrics`

### Artifact Handling

```
After entrypoint exits 0:
  1. Walk configured output directory (/workspace/outputs/)
  2. For each file:
     a. POST /api/runs/{run_id}/runtime/artifacts/upload-url
     b. PUT file to signed R2 URL
  3. POST /api/runs/{run_id}/runtime/artifacts/commit
     with list of R2 keys
  4. Artifact upload failures: warning only, do NOT fail the run

Periodic output sync (future):
  - Every configured interval while running (`RUN_OUTPUT_SYNC_INTERVAL_SECONDS`), sync output directory to R2
  - Ensures partial results are preserved even on pod failure
  - Cadence comes from shared config
  - When periodic sync stops (pod gone), backend terminates the pod
```

### Artifact Size Limits

- Configurable per-user in account settings.
- If not configured: no limit, upload everything.
- If configured: reject files exceeding per-file limit, warn on total limit.

## CLI Commands

| Command | Description |
|---------|-------------|
| `tahuna train` | Sync + create run + monitor (foreground) |
| `tahuna train -d` | Sync + create run + exit (detached) |
| `tahuna run create [-n NAME]` | Same as `tahuna train` + optional run name |
| `tahuna run rename <id|name> --name <new-name>` | Rename an existing run |
| `tahuna run list [-n N] [-a]` | List runs (newest first, default 10) |
| `tahuna run show <id>` | Show run details + artifact keys |
| `tahuna run watch <id>` | Live-follow run status |
| `tahuna run logs <id> [-n N] [-f]` | Show/follow run logs |
| `tahuna run delete <id>` | Delete run and its artifacts |
| `tahuna run cancel <id> [-f]` | Cancel a running/queued run |

## Invariants

- A run is always created with pinned code/data manifest hashes. These never change after creation.
- Provisioning failure on run creation rolls back the run record (no orphaned runs).
- Runtime token is single-use per run and cannot be reused.
- Artifact upload failures never cause a successful run to be marked as failed.
- Every state transition is logged as an immutable event in `runEvents`.
- Effective GPU specs are stored on the run record, not derived from the environment at read time.
- Run name is mutable via explicit rename operations only; run ID is immutable.

## Shared Defaults & Constants

- Polling intervals, queue timeout, cancellation grace windows, and retry budgets are defined in `web/config.ts`.
- CLI/dashboard text should not hardcode durations (for example, "30 seconds"); they should render configured values.

## Error States

| Condition | Behavior |
|-----------|----------|
| No synced code | Error: "Environment has no synced code. Run `tahuna sync` first." |
| No capacity (non-interactive) | Error: "No GPU capacity for <type>. Try a different GPU type." |
| No capacity (interactive) | Prompt for alternate GPU selection. |
| Pod bootstrap fails | Error: "Pod bootstrap failed: <reason>." Run transitions to `failed`. |
| Runtime token invalid | Pod requests rejected with 401. Run eventually times out to `failed`. |
| Run not found | Error: "Run not found." (HTTP 404) |
| Rename target ambiguous | Error: "Multiple runs match name <name>. Use run ID." |
| Cancel on terminal state | Error: "Run is already <status>." |

## Dependencies

- Sync (code/data must be synced before run creation)
- Environments (parent, default specs)
- Auth (user scoping, runtime token)
- Runpod API (pod provisioning)
- R2 (artifact storage)
- GPU catalog (spec validation)
