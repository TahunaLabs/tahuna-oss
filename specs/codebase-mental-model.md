# Tahuna Codebase Mental Model

Last reviewed: 2026-06-12

This document is a codebase-level mental model for Tahuna. It is written for someone who wants to understand the system deeply enough to debug lifecycle problems, reason about CLI/backend/runtime boundaries, and know where each concern lives.

## One Sentence Model

Tahuna is a local CLI plus Convex/Next.js control plane plus Go runtime agent. The CLI uploads project state and asks the backend to create runs or serves. The backend records durable state, provisions GPU machines, and gives the runtime signed materialization plans. The runtime container downloads pinned code/data/model objects, installs dependencies, runs user code, and reports logs, metrics, artifacts, and lifecycle state back to the backend.

## Component Map

| Component | Path | Runtime | Main responsibility |
|---|---|---:|---|
| CLI | `cli/` | Go binary on user machine | Auth, project init, sync, run/serve/research commands, polling/log display |
| Web app | `web/app`, `web/components`, `web/lib` | Next.js/React | Dashboard, auth UI, inference proxy routes |
| Convex backend | `web/convex` | Convex serverless TS | REST API for CLI, dashboard queries/mutations, job scheduling, lifecycle state, storage metadata |
| Runtime Warden | `runtime/warden` | Go binary inside GPU machine | Bootstrap, materialize, dependency install, train/serve process supervision, callbacks |
| Runtime images | `runtime/images` | Docker | Build Warden into framework/CUDA/Python base images and prebake Python framework packages |
| Product docs/specs | `docs/`, `specs/` | Markdown/MDX | User-facing docs and internal implementation plans |
| Examples | `examples/` | User projects | Sample Tahuna project layouts and training scripts |

## Core Domain Objects

| Object | Stored where | Meaning |
|---|---|---|
| API key | `apiKeys` table and local CLI config | User-facing bearer credential used by the CLI and inference proxy API-key path |
| Environment | `environments` table and local `.tahuna/environment_id` link | Durable project configuration: GPU defaults, framework/version/Python, latest sync manifest hashes, train command, serve snapshot |
| Project config | `tahuna.toml` | Local canonical source for project data/output dirs, runtime selection, train config, serve config |
| Code manifest | R2 object under environment manifest prefix, hash on environment/run/serve | Immutable list of code files by path, hash, size, mode |
| Data manifest | R2 object under data manifest prefix, hash on environment/run/serve | Immutable data bundle manifest; current CLI stores data as one deterministic tar.gz blob |
| Blob | R2 `blobs/{sha256}` | Content-addressed file body used by manifests |
| Run | `runs` table | One training execution, either ephemeral machine or assigned to a warm compute session |
| Compute session | `computeSessions` table | Keep-warm machine that can execute multiple separate run records sequentially |
| Serve | `serves` table | Long-lived inference process pinned to code/data plus immutable model snapshot |
| Runtime token | SHA256 stored on run/serve/session, raw token injected into container | Per-machine bearer token for runtime callback endpoints |
| Job | `jobs` table and Convex scheduler/Workpool | Idempotent provisioning, timeout, termination, cleanup work |
| Storage object | `storageObjects`, `dataBlobs` tables plus R2 | Indexed user-visible data uploads and run artifacts |

## Local Project State

The CLI expects a Tahuna project directory.

```text
project/
  tahuna.toml
  train.py
  inference.py              # optional, enables serve config
  pyproject.toml
  uv.lock
  data/
  outputs/
  .tahuna/
    environment_id
    sync_code_manifest.json
    sync_data_manifest.json
    research/
```

`cli/project.go` owns `tahuna.toml` parsing/rendering and validation. The default config model is:

```toml
[project]
data_dir = "data"
output_dir = "outputs"

[environment]
framework = "pt"
version = "2.11.0-cu130"
python_version = "3.11"
gpu_type = "..."
gpu_count = 1
volume_gb = 80

[train]
command = ["uv", "run", "train.py"]
dependency_group = "train" # or empty for base project dependencies
output_model_path = "outputs/model"
keep_warm_after_minutes = 10

[serve]
command = ["uv", "run", "inference.py"]
dependency_group = "serve"
python_version = "3.11"
gpu_type = "..."
gpu_count = 1
volume_gb = 80
port = 8000
health_path = "/health"
default_model_path = "outputs/model"
startup_timeout_seconds = 900
health_interval_seconds = 5
health_timeout_seconds = 2
health_failure_threshold = 3
graceful_shutdown_seconds = 30
```

The local `tahuna.toml` is the source for the next sync. The backend environment is the source for already-created runs and serves.

## CLI To Backend Communication

The CLI never talks to Convex functions directly. It talks to HTTP endpoints under `/api/*`.

Important files:

| Concern | Path |
|---|---|
| CLI command routing | `cli/main.go`, `cli/commands_core.go`, `cli/run_ops.go`, `cli/serve_ops.go`, `cli/research.go` |
| CLI HTTP client | `cli/ui_api.go` |
| CLI API DTOs | `cli/api_types.go` |
| Convex HTTP router | `web/convex/http.ts` |
| CLI auth/shared helpers | `web/convex/cli/shared.ts` |
| Run REST handlers | `web/convex/cli/runs.ts`, `web/convex/runsHttp.ts` |
| Serve REST handlers | `web/convex/cli/serves.ts`, `web/convex/servesHttp.ts` |
| Sync REST handlers | `web/convex/cli/sync.ts` |
| Compute-session runtime handlers | `web/convex/computeSessionsHttp.ts` |

### CLI Config Resolution

`initConfig()` in `cli/ui_api.go` resolves:

- `TAHUNA_API_URL`
- `TAHUNA_BROWSER_URL`
- `TAHUNA_API_KEY`
- config file under `~/.config/tahuna/config.env` or `~/.config/tahuna-dev/config.env`

There are two binary modes:

- `tahuna`: production mode, default API `https://tahuna.app`, refuses localhost.
- `tahuna-dev`: development mode, default API `http://localhost:3000`, refuses `tahuna.app`.

### HTTP Client Behavior

All typed calls go through:

- `doJSONRaw(method, path, payload)`
- `doJSON(method, path, payload)`
- `doJSONAs[T](method, path, payload)`

Behavior:

1. Normalize path so `/runs` becomes `/api/runs`.
2. If `TAHUNA_API_URL` already ends in `/api`, avoid duplicating `/api`.
3. JSON-encode payload if present.
4. Add `Content-Type: application/json`.
5. Add `Authorization: Bearer <TAHUNA_API_KEY>` when present.
6. Require JSON responses, otherwise emit a diagnostic that usually means the API URL points at the wrong service.
7. Convert backend `{ detail }` errors into `apiRequestError`.
8. Render friendlier user errors for common statuses.

### Backend Auth Boundary

User-facing CLI endpoints call `authenticateApiRequest()` in `web/convex/cli/shared.ts`.

```text
Authorization: Bearer <api_key>
  -> api.auth.authByApiKey
  -> userId
  -> best-effort lastUsedAt update
```

Runtime endpoints do not use user API keys. They use the per-run/per-serve/per-session runtime token. The backend stores only the SHA256 hash. The raw token is injected into the container as `TAHUNA_RUNTIME_TOKEN`.

### Major HTTP Route Families

Defined in `web/convex/http.ts`:

| Route | Used by | Purpose |
|---|---|---|
| `GET /api/health` | CLI shell/status | Backend health check |
| `GET /api/gpus` | CLI init, GPU validation, research spend | Dynamic GPU offers plus runtime image catalog |
| `/api/environments/*` | CLI env/init/sync/run | Environment CRUD and data bindings |
| `/api/sync/blobs/missing` | CLI sync | Ask which content-addressed blobs need upload |
| `/api/sync/blobs/upload-url` | CLI sync | Get signed R2 upload URL for a blob |
| `/api/sync/manifests/upload-url` | CLI sync | Get signed R2 upload URL for manifest |
| `/api/sync/commit` | CLI sync | Validate uploaded manifests and update environment state |
| `/api/runs` | CLI/dashboard | List/create runs |
| `/api/runs/{id}` | CLI/dashboard | Get, rename, delete run |
| `/api/runs/{id}/logs` | CLI | Recent runtime logs and metrics |
| `/api/runs/{id}/metrics/final` | Auto-Research | Deterministic final metric lookup |
| `/api/runs/{id}/cancel` | CLI/dashboard | Request cancellation |
| `/api/runs/{id}/runtime/*` | Warden | Run bootstrap/status/logs/metrics/artifacts |
| `/api/compute_sessions/{id}/runtime/*` | Warden session mode | Heartbeat, assignment, idle |
| `/api/serves` | CLI/dashboard | List/create serves |
| `/api/serves/{id}` | CLI/dashboard | Get serve |
| `/api/serves/{id}/logs` | CLI/dashboard | Serve logs |
| `/api/serves/{id}/stop` | CLI/dashboard | Stop serve |
| `/api/serves/{id}/runtime/*` | Warden | Serve bootstrap/status/logs |
| `/api/monitoring/wandb/*` | W&B-compatible clients | W&B-style metrics/files |
| `/api/stripe/webhook` | Stripe | Billing webhooks |

## Sync Model

Sync is the critical reproducibility boundary.

The CLI does not upload "a project" as an opaque archive for code. It builds manifests of files and uploads missing content-addressed blobs. Runs and serves pin manifest hashes.

### Code Sync

Owned by `cli/sync.go`.

1. Validate local project bindings with `validateProjectConfigBindings`.
2. Build code manifest:
   - Prefer `git ls-files -co --exclude-standard`.
   - Fallback to filesystem walk.
   - Exclude `.git`, `.tahuna`, `node_modules`, `__pycache__`, configured data dir, configured output dir.
   - Skip symlinks and non-regular files.
   - Each entry is `{ path, sha256, size, mode }`.
3. Hash the canonical JSON manifest.
4. Ask backend which `blobs/{sha256}` are missing.
5. Upload missing blobs through signed R2 URLs.
6. Upload manifest JSON through signed R2 URL.
7. Commit sync.

### Data Sync

The current data sync compresses the configured data directory into a single deterministic tar.gz.

1. Walk data directory, sorted.
2. Write tar entries with deterministic modtime and gzip metadata.
3. Manifest has one path: `__tahuna__/data_bundle.tar.gz`.
4. Upload it like any other content-addressed blob.
5. Warden later expands it under `/workspace/data`.

This makes many-small-file datasets cheaper to materialize on GPU volumes.

### Sync Commit

`POST /api/sync/commit` in `web/convex/cli/sync.ts`:

1. Authenticates API key.
2. Checks environment ownership.
3. Rejects legacy inline manifest payloads.
4. Validates manifest hashes are SHA256.
5. Verifies each manifest object exists in R2.
6. Reads manifest bytes from R2.
7. Recomputes manifest hash and parses manifest payload.
8. Normalizes synced config fields:
   - framework
   - version
   - python version
   - GPU type/count
   - volume
   - train command
   - train dependency group
   - output dir
   - serve snapshot
9. Calls `internal.environments.internalCommitSync`.

The environment's latest manifest hashes are updated only after the backend has verified the object store contains valid manifest content.

### Storage Key Layout

Defined in `web/convex/core/storage.ts`.

```text
blobs/{sha256}
data/{blobId}__{encodedFilename}
data/{dataId}/manifests/{hash}.json
environments/{environmentId}/manifests/code/{hash}.json
runs/{environmentId}/{timestamp}/input
runs/{environmentId}/{timestamp}/output
runs/{environmentId}/{timestamp}/logs
serves/{environmentId}/{timestamp}-{suffix}/model/...
serves/{environmentId}/{timestamp}-{suffix}/model-manifest.json
```

The same `blobs/{sha256}` namespace backs both code and data manifests. User-visible dashboard uploads and run artifacts are separately indexed in Convex tables.

## Runtime Image Catalog And Docker Baking

The backend image catalog is built from:

- `web/convex/runtime-images.json`
- `web/convex/catalog.ts`
- environment variable `TAHUNA_RUNTIME_IMAGE_REPO`

`runtime-images.json` maps framework/version/Python support. Example:

```json
{
  "pt": {
    "2.11.0-cu130": {
      "base": "nvidia/cuda:13.0.1-devel-ubuntu24.04",
      "python": ["3.11", "3.12", "3.13"]
    }
  }
}
```

`catalog.ts` turns that into image names:

```text
{TAHUNA_RUNTIME_IMAGE_REPO}:{framework}-{version}-py{python}
```

### What Is Baked Into Runtime Images

`runtime/images/Dockerfile`:

1. Builds Warden from `runtime/warden` in a `golang:1.22-alpine` stage.
2. Starts from framework/CUDA `BASE_IMAGE`.
3. Installs `curl`, `ca-certificates`, and `uv`.
4. Installs requested Python version with `uv python install`.
5. Creates prebaked venv at `/opt/tahuna/venv`.
6. Installs framework packages into that venv:
   - `torch=={frameworkVersion}`
   - `torchvision`
   - `torchaudio`
   - `triton`
   - PyTorch CUDA extra index based on the version suffix, such as `cu130`.
7. Writes protected package versions to `/opt/tahuna/protected-package-versions.json`.
8. Copies `warden` to `/usr/local/bin/warden`.

Important baked env vars:

```text
TAHUNA_PREBAKE_FRAMEWORK
TAHUNA_PREBAKE_VERSION
TAHUNA_PREBAKED_PYTHON_VERSION
TAHUNA_PREBAKED_VENV=/opt/tahuna/venv
TAHUNA_PREBAKED_PROTECTED_PACKAGES
TAHUNA_PREBAKED_PROTECTED_VERSIONS_FILE=/opt/tahuna/protected-package-versions.json
UV_CACHE_DIR=/opt/tahuna/.uv-cache
```

The image does not bake user code, user data, model artifacts, run IDs, API URLs, or secrets. Those are injected at provisioning/runtime.

### What Is Injected At Provisioning Time

`web/convex/runtimeProvisioning.ts` creates a raw runtime token, stores its SHA256 hash on the target row, resolves the runtime API base, then calls `computeProvider.createMachine`.

Run mode env from `web/convex/runs.ts`:

```text
TAHUNA_RUN_ID
TAHUNA_ENVIRONMENT_ID
TAHUNA_CONTRACT_VERSION
TAHUNA_INPUT_PATH
TAHUNA_OUTPUT_DIR
TAHUNA_OUTPUT_PATH
TAHUNA_LOGS_PATH
TAHUNA_CODE_MANIFEST_HASH
TAHUNA_DATA_MANIFEST_HASH
TAHUNA_CODE_MANIFEST_KEY
TAHUNA_DATA_MANIFEST_KEY
TAHUNA_API_BASE
TAHUNA_RUNTIME_TOKEN
TAHUNA_WORKSPACE_ROOT=/workspace
TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS
TAHUNA_CANCELLATION_GRACE_SECONDS
WANDB_API_KEY=<runtime token>
WANDB_BASE_URL=<runtime api base>/api/monitoring/wandb
```

Serve mode env from `web/convex/serves.ts`:

```text
TAHUNA_SERVE_ID
TAHUNA_ENVIRONMENT_ID
TAHUNA_CONTRACT_VERSION
TAHUNA_OUTPUT_DIR
TAHUNA_API_BASE
TAHUNA_RUNTIME_TOKEN
TAHUNA_WORKSPACE_ROOT=/workspace
TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS
TAHUNA_CANCELLATION_GRACE_SECONDS
WANDB_API_KEY=<runtime token>
WANDB_BASE_URL=<runtime api base>/api/monitoring/wandb
```

Compute-session mode env from `web/convex/computeSessions.ts`:

```text
TAHUNA_COMPUTE_SESSION_ID
TAHUNA_ENVIRONMENT_ID
TAHUNA_API_BASE
TAHUNA_RUNTIME_TOKEN
TAHUNA_WORKSPACE_ROOT=/workspace
TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS
TAHUNA_CANCELLATION_GRACE_SECONDS
WANDB_API_KEY=<runtime token>
WANDB_BASE_URL=<runtime api base>/api/monitoring/wandb
```

User environment variables are stored encrypted in `envVars`, decrypted at provisioning, filtered by `shouldInjectEnvironmentEnvVar`, and then merged. Reserved names are blocked:

- any name starting with `TAHUNA_`
- `PATH`
- `VIRTUAL_ENV`
- `UV_PROJECT_ENVIRONMENT`

System env wins over user env.

## Warden Runtime Modes

Warden chooses mode from env in `runtime/warden/internal/config/config.go`.

Exactly one must be set:

- `TAHUNA_RUN_ID` -> run mode
- `TAHUNA_SERVE_ID` -> serve mode
- `TAHUNA_COMPUTE_SESSION_ID` -> compute-session mode

Shared required env:

- `TAHUNA_API_BASE`
- `TAHUNA_RUNTIME_TOKEN`

Defaults:

- `TAHUNA_WORKSPACE_ROOT=/workspace`
- `TAHUNA_OUTPUT_DIR=outputs`
- request timeout `120s`
- cancellation grace `30s`

### Runtime API Client

`runtime/warden/internal/runtimeapi/client.go` builds URLs like:

```text
{TAHUNA_API_BASE}/api/{runs|serves|compute_sessions}/{id}/runtime/{action}
```

It sends `Authorization: Bearer {TAHUNA_RUNTIME_TOKEN}`.

Run runtime actions:

- `GET bootstrap`
- `POST status`
- `POST logs`
- `POST metrics`
- `POST artifacts/upload-url`
- `POST artifacts/commit`

Serve runtime actions:

- `GET bootstrap`
- `POST status`
- `POST logs`

Compute-session runtime actions:

- `GET assignment`
- `POST heartbeat`
- `POST idle`

## Run Lifecycle

A run is a single training execution. It is short-lived and terminal.

Important files:

| Concern | Path |
|---|---|
| CLI create/train | `cli/commands_core.go`, `cli/run_ops.go` |
| HTTP create/cancel/logs | `web/convex/cli/runs.ts`, `web/convex/runsHttp.ts` |
| Core lifecycle plans | `web/convex/core/runLifecyclePlan.ts` |
| Run lifecycle application | `web/convex/runsLifecycle.ts`, `web/convex/runs.ts` |
| Warden run mode | `runtime/warden/internal/bootstrap/run.go` |

### Run States

Defined in `web/convex/core/runLifecyclePlan.ts`:

```text
queued
provisioning
running
cancelling
completed
failed
cancelled
```

Active:

```text
queued, provisioning, running, cancelling
```

Terminal:

```text
completed, failed, cancelled
```

### `tahuna run create`

`runCreate()`:

1. Resolve linked environment from `.tahuna/environment_id`.
2. Run `preRunSync(environmentID)`.
3. Build payload:
   - optional name
   - optional GPU type/count override
   - optional volume override
4. Validate GPU count against `/api/gpus` if supplied.
5. `POST /api/environments/{environmentID}/runs`.
6. Unless detached, monitor logs until terminal.

### `tahuna train`

`train()` is a higher-level convenience over run creation.

Differences from `run create`:

- Uses train-specific UX and output.
- Supports keep-warm flags:
  - `--keep-warm-minutes <n>`
  - `--warm`
  - `--no-keep-warm`
- Falls back to `train.keep_warm_after_minutes` from `tahuna.toml` unless disabled.
- Prints next-step warm-compute guidance after completion.

It still creates a normal run record. The backend does not have a separate `train` object.

### Backend Run Creation

`createAndProvisionRunStrict()` in `web/convex/cli/shared.ts` coordinates HTTP run creation.

Cold ephemeral run:

1. `internal.runs.internalCreate`
2. Insert run row in `queued`.
3. Call `internal.runs.provisionRun`.
4. If provisioning fails due to capacity, remove run and return 409.

Keep-warm baseline run:

1. Create compute session.
2. Create initial run with `computeSessionId`, no run provisioning job.
3. Provision compute session machine.
4. That machine runs Warden session mode and executes the initial run assignment.

Warm run:

1. Look up environment active compute session.
2. Validate session exists, is `idle`, heartbeat is fresh, idle timeout not expired.
3. Create run with `computeSessionId`, no machine provisioning.
4. Session-mode Warden polls assignment and executes it.

### Run Record Creation

`createRunForUserId()` in `web/convex/runsLifecycle.ts`:

1. Load accessible environment.
2. Require train command.
3. Require train dependency group selection, unless base deps are explicitly selected.
4. Resolve effective GPU/volume from run overrides or environment defaults.
5. Require latest code manifest hash.
6. Pick/validate unique run name.
7. Resolve runtime image from framework/version/Python.
8. Check runtime incompatibility cooldowns.
9. Insert run row:
   - pinned command
   - pinned `codeManifestHash`
   - pinned `dataManifestHash`
   - input/output/log R2 prefixes
   - effective GPU/volume
   - dependency group
   - `executionMode` = `ephemeral` or `session`
10. Insert `runEvents` row.
11. Enqueue provision job if needed.

### Provisioning

`provisionRun()` in `web/convex/runs.ts`:

1. Load provisioning payload and provision spec.
2. Mark run `provisioning`.
3. Abort if cancellation/terminal state appeared.
4. Resolve environment env vars.
5. Validate pinned code/data manifests still read from R2.
6. Generate runtime token and store hash on run.
7. Create provider machine:
   - name `tahuna-{runId}`
   - image from `resolveImageName`
   - effective GPU/volume
   - env vars above
8. Mark provider machine provisioned.
9. Schedule startup timeout job.

### Warden Run Mode

`runtime/warden/internal/bootstrap/run.go`:

1. Emit `provisioning` status.
2. `GET /api/runs/{runId}/runtime/bootstrap`.
3. Materialize code to `/workspace`.
4. Ensure `/workspace/data` and output dir.
5. Materialize data concurrently.
6. Install Python deps with `uv sync`.
7. Extract data bundle if present.
8. Emit bootstrap logs and metrics.
9. Emit `running`.
10. Run train command.
11. Parse stdout/stderr lines into logs.
12. Extract metrics from `NAME=NUMBER` patterns.
13. On exit, sync artifacts from output dir.
14. Emit `completed`, `failed`, or `cancelled`.

Dependency install in `runtime/warden/internal/deps/install.go`:

- Requires `pyproject.toml`.
- Ensures `uv` exists.
- Uses `uv.lock` with `--frozen` when present.
- Uses active prebaked venv if `/opt/tahuna/venv` exists.
- Runs `uv sync --active --frozen --no-dev --inexact --group <group>`.
- Skips protected packages (`torch`, `torchvision`, `torchaudio`, `triton`) when prebaked versions match lockfile.
- Retries full sync if selective skip fails.

### Run Metrics

Warden parses train output with:

```text
([A-Za-z_][A-Za-z0-9_]*)=([-+]?(?:\d+\.\d+|\d+)(?:e[+-]?\d+)?)
```

Each parsed value becomes a `runRuntimeMetrics` row through `/runtime/metrics`.

Auto-Research uses deterministic final metric lookup:

`GET /api/runs/{runId}/metrics/final?name={metric}`

Selection rules in `web/convex/runsRead.ts`:

1. Query all `runRuntimeMetrics` by `runId` and metric name.
2. Prefer rows with `source === "train"`.
3. Prefer rows with numeric step.
4. Prefer highest step.
5. Then newest timestamp.
6. Then newest creation time/id.

### Artifacts

`runtime/warden/internal/artifacts/artifacts.go`:

1. Walk output dir.
2. Ignore zero-byte files.
3. Request upload URLs from `/runtime/artifacts/upload-url`.
4. PUT each artifact to R2.
5. Commit uploaded keys through `/runtime/artifacts/commit`.

Backend artifact commit:

- Accepts only keys under the run output prefix.
- Adds new keys to `runs.artifactKeys`.
- Indexes objects in `storageObjects`.

Artifact upload failures are logged as warnings by Warden and do not necessarily fail the run after the train command succeeded.

### Cancellation

`tahuna run cancel` calls `POST /api/runs/{id}/cancel`.

Backend plan:

- If terminal: reject.
- If no provider machine yet: transition to `cancelled`.
- If provider machine exists:
  - set `cancellationRequested`
  - transition to `cancelling`
  - schedule terminate-machine job after grace, or immediately with force

When Warden receives SIGTERM, it forwards SIGTERM to the train process, waits for grace, force kills, syncs whatever artifacts exist, and emits `cancelled`.

Terminal statuses revoke the runtime token and enqueue forced machine termination unless suppressed by a session workflow.

## Compute Sessions And Warm Runs

Compute sessions separate machine lifetime from run lifetime.

Important files:

| Concern | Path |
|---|---|
| CLI keep-warm flags | `cli/commands_core.go`, `cli/warm_compute.go` |
| Backend session lifecycle | `web/convex/computeSessions.ts`, `web/convex/core/computeSessionLifecyclePlan.ts` |
| Runtime session callbacks | `web/convex/computeSessionsHttp.ts` |
| Warden session mode | `runtime/warden/internal/bootstrap/session.go` |

Session states:

```text
provisioning
idle
running
terminating
terminated
failed
```

Flow:

1. User starts a run with keep-warm.
2. Backend creates `computeSessions` row.
3. Backend creates initial run with `computeSessionId`.
4. Backend provisions one machine in session mode.
5. Warden session mode emits heartbeat every 15 seconds.
6. Warden polls `/assignment` every 5 seconds.
7. Backend assigns an active run.
8. Warden creates a run runtime client with the same runtime token and runs normal training flow.
9. Warden marks session idle after run completion.
10. Later `tahuna train --warm` creates another run assigned to the active idle session.
11. Crons terminate timed-out heartbeat or idle sessions.

Warm runs are still separate run records. Each run has its own pinned manifests, logs, metrics, artifacts, and terminal state.

## Serve Lifecycle

A serve is long-lived inference. It is not just a run with a different command.

Important files:

| Concern | Path |
|---|---|
| CLI serve commands | `cli/serve_ops.go` |
| Backend serve model | `web/convex/serves.ts`, `web/convex/servesLifecycle.ts` |
| Serve lifecycle plans | `web/convex/core/serveLifecyclePlan.ts` |
| Runtime callbacks | `web/convex/servesHttp.ts` |
| Warden serve mode | `runtime/warden/internal/bootstrap/serve_mode.go`, `runtime/warden/internal/serve/serve.go` |
| Inference proxy | `web/app/api/serves/[serveId]/inference/[[...path]]/route.ts` |

### Serve States

Defined in `web/convex/core/serveLifecyclePlan.ts`:

```text
queued
provisioning
starting
serving
stopping
stopped
failed
```

Active:

```text
queued, provisioning, starting, serving, stopping
```

Terminal:

```text
stopped, failed
```

Valid runtime transitions are stricter than run transitions:

```text
queued -> provisioning -> starting -> serving -> stopping -> stopped
queued/provisioning/starting/serving -> failed
```

### `tahuna serve create`

CLI requires exactly one model source:

```text
tahuna serve create --from-run <completed-run-id> [--model-path <path>]
tahuna serve create --from-storage-prefix <prefix>
```

`--model-path` is valid only with `--from-run`.

Before creating a serve, the CLI:

1. Resolves linked environment.
2. Ensures serving is enabled locally.
3. Ensures serve dependency group selection.
4. Syncs when serve config changed.
5. Calls `POST /api/serves`.

### Serve Config Snapshot

Serve config is synced into `environments.serveSnapshot`.

It contains:

- serve command
- dependency group
- Python version
- serve GPU/volume
- port
- health path
- default model path
- startup/health/shutdown timings

Creating a serve uses the environment's current serve snapshot and latest code/data manifests. Later local config changes do not mutate an existing serve.

### Model Snapshot Creation

`internalPrepareCreate()` and `internalCreate()` in `web/convex/serves.ts`:

From completed run:

1. Load source run.
2. Require status `completed`.
3. Use run output prefix and selected model path.
4. Filter `run.artifactKeys` under that model path.
5. Error if no artifacts match.

From storage prefix:

1. Query indexed `storageObjects` for matching keys.
2. Error if prefix has no objects.

Then for both:

1. Allocate immutable snapshot base prefix:
   - `serves/{environmentId}/{timestamp}-{suffix}`
2. Copy each source object to:
   - `{snapshotBase}/model/{relativePath}`
3. Write `model-manifest.json`:
   - `version: "serve-model-snapshot.v1"`
   - object prefix
   - entries with path/key/size/sha256
4. Store snapshot metadata on the serve row.
5. Clean copied objects on creation failure.

The serve runtime never reads directly from the source run or source storage prefix. It reads from the immutable copied model snapshot.

### Backend Serve Creation And Provisioning

`createAndProvisionServeStrict()`:

1. Calls `internal.serves.internalCreate` with `enqueueProvisioning: false`.
2. Calls `internal.serves.provisionServe`.
3. If no capacity, removes serve and returns 409.

`provisionServe()`:

1. Load provisioning payload and serve provision spec.
2. Mark serve provisioning.
3. Validate pinned code/data manifests and model manifest.
4. Resolve env vars.
5. Generate runtime token and store hash.
6. Create provider machine:
   - name `tahuna-{serveId}`
   - image by framework/version/Python
   - GPU/volume from serve config
   - ports: `22/tcp` and `{servePort}/http`
7. Mark machine provisioned.
8. Schedule startup timeout.

### Warden Serve Mode

`runtime/warden/internal/bootstrap/serve_mode.go`:

1. Emit `provisioning`.
2. Fetch serve bootstrap plan.
3. Materialize code to `/workspace`.
4. Materialize data to `/workspace/data`.
5. Materialize model snapshot to `/workspace/model`.
6. Install dependencies.
7. Run serve command.
8. Report `starting` after process starts.
9. Probe `http://127.0.0.1:{port}{health_path}`.
10. Report `serving` on first healthy HTTP 200.
11. Continue probing.
12. On stop/cancel context, report `stopping`, SIGTERM process group, then force kill after grace.
13. Report `stopped` when graceful shutdown completes.
14. Report `failed` on process exit, readiness timeout, or health failure threshold.

The serve process gets these user-facing env vars in addition to inherited system env:

```text
TAHUNA_SERVE_ID
TAHUNA_WORKSPACE_ROOT
TAHUNA_DATA_DIR
TAHUNA_OUTPUT_DIR
TAHUNA_MODEL_ROOT
TAHUNA_SERVE_PORT
TAHUNA_SERVE_HEALTH_PATH
```

### Inference Proxy

Next route:

`web/app/api/serves/[serveId]/inference/[[...path]]/route.ts`

It is the public stable inference URL layer.

Auth modes:

- Bearer API key.
- Browser session, with same-origin protections.

Behavior:

1. Resolve serve target through Convex.
2. Require serve status `serving`.
3. Resolve provider ingress endpoint from `providerMachineId` and port.
4. Strip hop-by-hop, auth, cookie, and forwarded headers.
5. Add:
   - `x-tahuna-inference-proxy: 1`
   - `x-tahuna-serve-id`
6. Enforce request body limit from `INFERENCE_PROXY_CONFIG`.
7. Enforce upstream timeout from `INFERENCE_PROXY_CONFIG`.
8. Stream upstream response back with unsafe response headers stripped.

## Run Versus Serve Versus Auto-Research

| Dimension | Run / Train | Serve | Auto-Research |
|---|---|---|---|
| User command | `tahuna train`, `tahuna run create` | `tahuna serve create` | `tahuna research run` |
| Backend durable object | `runs` | `serves` | Local `.tahuna/research/*.json` plus normal runs |
| Runtime mode | Warden run mode or session mode | Warden serve mode | No special runtime mode |
| Lifetime | Terminal execution | Long-lived service | Local loop over many terminal runs |
| Input code | Latest synced code manifest pinned on run | Latest synced code manifest pinned on serve | Each baseline/trial syncs and creates a normal pinned run |
| Input data | Latest synced data manifest pinned on run | Latest synced data manifest pinned on serve | Same as run |
| Model input | None by default; training writes artifacts | Immutable model snapshot copied from run artifacts or storage prefix | Incumbent patch in local Git worktree |
| Output | Artifacts from output dir | Live inference endpoint and serve logs | Session JSON, patch snapshots, graph, accepted/rejected trial runs |
| Process command | Train command | Serve command | CLI creates train runs; local agent/user edits code |
| Status model | `queued/provisioning/running/cancelling/completed/failed/cancelled` | `queued/provisioning/starting/serving/stopping/stopped/failed` | `running`, `awaiting_patch`, `running_trial`, `budget_exhausted`, `failed` in local JSON |
| Auth from machine | Runtime token on run/session | Runtime token on serve | Uses normal CLI API key to create/poll runs |
| Artifacts | Uploaded after training | Model snapshot exists before serve starts; serve runtime does not upload model artifacts | Reads run metrics and keeps/restores local patches |

## Auto-Research

Auto-Research is a local CLI harness. It is not a cloud-hosted agent and not a backend scheduler.

Important files:

| Concern | Path |
|---|---|
| CLI implementation | `cli/research.go` |
| Local MVP spec | `specs/autoresearch-local-mvp.md` |
| User docs | `docs/content/docs/auto-research.mdx` |

### What It Does

New session:

1. Validate project, Git worktree, linked environment, metric, direction, budget, editable allowlist.
2. Capture starting patch hash.
3. Persist `.tahuna/research/{sessionId}.json`.
4. Run budget precheck.
5. `preRunSync(environmentID)`.
6. Create baseline normal Tahuna run named `{sessionId}-baseline`.
7. Monitor it to terminal.
8. Fetch final metric from `/api/runs/{id}/metrics/final`.
9. Store baseline and incumbent.
10. Write `starting.patch` and `incumbent.patch`.
11. Exit with status `awaiting_patch` unless budget exhausted.

Resume:

1. Load session JSON.
2. Validate no new session flags are mixed with `--resume`.
3. Validate project and runtime spec unchanged.
4. Validate budget.
5. Capture current Git diff.
6. Require patch is non-empty, tracked-file only, and inside editable allowlist.
7. Save `trial-N.patch`.
8. Sync code/data.
9. Create normal run named `{sessionId}-trial-N`.
10. Monitor until terminal or max-trial-minutes timeout.
11. Fetch final metric.
12. Compare to incumbent:
    - accepted: metric improves by at least `min_improvement`, keep patch, update incumbent.
    - rejected: metric does not improve, restore incumbent patch.
    - inconclusive: failed run, timeout, missing metric, sync/create/monitor failure, restore incumbent patch.
13. Update session JSON and print next command or budget exhausted.

### Warm Auto-Research

Auto-Research only uses warm compute when explicitly passed:

```text
--keep-warm-minutes <minutes>
```

It does not inherit `train.keep_warm_after_minutes`.

Warm behavior:

- Baseline payload gets `keep_warm_after_minutes`.
- Trial payloads get `warm: true`.
- Runtime spec is recorded in session JSON.
- Resume rejects runtime spec drift because warm compute is environment-scoped.
- If warm compute is stale or busy, the trial is not counted as inconclusive. The CLI removes the provisional trial entry and surfaces the warm-compute error.

### Local State Files

```text
.tahuna/research/{sessionId}.json
.tahuna/research/{sessionId}/starting.patch
.tahuna/research/{sessionId}/incumbent.patch
.tahuna/research/{sessionId}/trial-N.patch
.tahuna/research/{sessionId}/progress.svg
```

### Why It Is Not A Runtime Mode

Every expensive experiment is a regular Tahuna run. Auto-Research adds local orchestration around runs:

- Git safety
- patch hashing/restoring
- budget enforcement
- final metric lookup
- trial verdicts
- SVG graph rendering

The backend does not know a run belongs to Auto-Research except through the run name and normal run metadata.

## Backend Lifecycle Architecture

The backend deliberately splits pure lifecycle decisions from effects.

Pure plan modules:

- `web/convex/core/runLifecyclePlan.ts`
- `web/convex/core/serveLifecyclePlan.ts`
- `web/convex/core/computeSessionLifecyclePlan.ts`
- `web/convex/core/jobQueue.ts`

Effect/application modules:

- `web/convex/runsLifecycle.ts`
- `web/convex/servesLifecycle.ts`
- `web/convex/computeSessions.ts`
- `web/convex/convexJobQueue.ts`

Pattern:

```text
current row + command/runtime input
  -> pure plan
       patch?
       events?
       jobs?
       storage operations?
  -> apply plan in Convex mutation/action
```

This is why status transition behavior is mostly understandable without reading provider code.

### Job System

Core job types:

```text
provision_run
check_startup_timeout
terminate_machine
finalize_artifact
cleanup_failed_upload
provision_serve
check_serve_startup_timeout
terminate_serve_machine
delete_serve_data
```

Jobs have idempotency keys. `web/convex/convexJobQueue.ts` records them in `jobs` and then schedules Convex actions through:

- Workpool for provisioning, with max parallelism from `RUN_CONFIG.workpoolMaxParallelism`.
- Convex scheduler for delayed timeout/termination/cleanup work.

## Failure And Cleanup Model

### Startup Timeout

Run and serve provisioning schedule startup timeout jobs.

For runs:

- If still `provisioning` for the same provider machine after `RUN_CONFIG.startupTimeoutSeconds`, mark failed.
- Classify runtime incompatibility when possible.
- Store cooldown in `runtimeIncompatibilities` to block known-bad GPU/image combinations temporarily.

For serves:

- Similar, but timeout uses serve-specific `startupTimeoutSeconds`.

### Runtime Failure

Run runtime `failed`:

- Store sanitized error.
- Set status `failed`.
- Revoke runtime token.
- Insert terminal event with timing metadata.
- Force terminate provider machine.

Serve runtime `failed`:

- Store sanitized error.
- Set status `failed`.
- Revoke runtime token.
- Insert terminal event.
- Force terminate provider machine.

### Deletion

Run delete:

- Active runs require `--cancel` or `--force`.
- Deletes run events, logs, metrics, W&B rows in batches.
- Deletes indexed artifact storage records, not necessarily every R2 object body.

Serve remove:

- Reads model snapshot manifest and deletes copied model objects plus manifest.
- Falls back to prefix cleanup if manifest is unreadable.
- Deletes serve events/logs and serve row.

## Dashboard Model

The dashboard does not use the CLI REST client. It uses Convex React hooks in `web/lib/dashboard-api.ts`.

Examples:

- `useDashboardEnvironments()` -> `api.environments.list`
- `useDashboardRuns()` -> `api.runs.list`
- `useDashboardRunLogs()` -> `api.runs.getRunLogs`
- `useDashboardServes()` -> `api.serves.list`
- `useGenerateDashboardUploadUrl()` -> `api.data.generateUploadUrl`

The CLI REST API and dashboard Convex API converge on the same Convex tables and lifecycle functions.

## End-To-End Flow: `tahuna init .`

1. CLI resolves config/auth.
2. CLI fetches GPU/image catalog from `/api/gpus`.
3. CLI inspects local files:
   - `train.py`
   - `inference.py`
   - `pyproject.toml`
   - `uv.lock`
   - data/output dirs
4. CLI detects or prompts for framework/Python/runtime settings.
5. CLI creates missing scaffold files and dirs.
6. CLI prompts for GPU/volume.
7. CLI creates backend environment with `POST /api/environments`.
8. CLI writes `.tahuna/environment_id`.
9. CLI writes `tahuna.toml`.
10. CLI runs sync.
11. Backend environment now has latest code/data manifest hashes and config fields.

## End-To-End Flow: Cold `tahuna train`

```text
CLI
  load project config
  ensure train dependency group
  sync code/data/config
  POST /api/environments/{env}/runs

Backend
  authenticate API key
  create run row pinned to latest manifests
  generate runtime token hash
  validate manifests
  create GPU machine with Warden image and env
  mark machine provisioned

Warden
  load env and choose run mode
  GET /api/runs/{run}/runtime/bootstrap
  download code/data blobs using signed URLs
  extract data bundle
  uv sync dependencies
  emit running
  execute train command
  stream logs and metrics
  upload artifacts
  emit terminal status

Backend
  ingest logs/metrics/artifacts/status
  revoke runtime token at terminal status
  terminate machine

CLI
  poll status/logs until terminal
```

## End-To-End Flow: `tahuna serve create --from-run`

```text
CLI
  ensure serve config and dependency group
  sync serve snapshot/config
  POST /api/serves

Backend
  authenticate API key
  load completed source run
  select artifact keys under model path
  copy model artifacts into immutable serve snapshot prefix
  write serve model manifest
  insert serve row queued
  provision GPU machine with HTTP port exposed

Warden
  choose serve mode
  fetch serve bootstrap plan
  materialize code/data/model
  uv sync serve deps
  run serve command
  health probe local port/path
  emit starting/serving/stopped/failed

Next.js inference proxy
  authenticate user/API key
  resolve provider ingress endpoint
  forward inference request to live serve
```

## End-To-End Flow: Auto-Research Trial

```text
local agent/user edits allowed tracked files
  -> tahuna research run --resume {sessionId}
  -> CLI validates patch and budgets
  -> CLI syncs code/data
  -> CLI creates normal run
  -> Warden executes normal training lifecycle
  -> CLI fetches final metric
  -> CLI accepts/rejects/inconclusive
  -> CLI keeps or restores local Git patch
  -> CLI updates .tahuna/research session JSON
```

## Where To Look When Debugging

| Symptom | Start here |
|---|---|
| CLI auth or wrong API URL | `cli/ui_api.go`, `cli/main.go`, `web/convex/cli/shared.ts` |
| Sync upload or manifest commit | `cli/sync.go`, `web/convex/cli/sync.ts`, `web/convex/syncManifest.ts` |
| Environment config mismatch | `cli/project.go`, `web/convex/environments.ts` |
| Run not creating | `cli/commands_core.go`, `web/convex/cli/runs.ts`, `web/convex/runsLifecycle.ts` |
| Capacity fallback | `cli/capacity_fallback.go`, `web/convex/cli/shared.ts`, `web/convex/computeProvider.ts` |
| Runtime never starts | `web/convex/runtimeProvisioning.ts`, `web/convex/runs.ts`, `runtime/warden/internal/config/config.go` |
| Bootstrap/materialization failure | `web/convex/runtimeBootstrap.ts`, `runtime/warden/internal/materialize`, `runtime/warden/internal/bootstrap` |
| Dependency install failure | `runtime/warden/internal/deps/install.go`, project `pyproject.toml`, project `uv.lock` |
| Metrics missing | `runtime/warden/internal/train/train.go`, `web/convex/runsHttp.ts`, `web/convex/runsRead.ts` |
| Artifacts missing | `runtime/warden/internal/artifacts/artifacts.go`, `web/convex/runsHttp.ts`, `web/convex/runs.ts` |
| Warm compute issues | `cli/warm_compute.go`, `web/convex/computeSessions.ts`, `runtime/warden/internal/bootstrap/session.go` |
| Serve creation/model source | `cli/serve_ops.go`, `web/convex/serves.ts` |
| Serve health failures | `runtime/warden/internal/serve/serve.go`, `web/convex/core/serveLifecyclePlan.ts` |
| Inference request failure | `web/app/api/serves/[serveId]/inference/[[...path]]/route.ts`, `web/convex/serves.ts` |
| Auto-Research behavior | `cli/research.go`, `.tahuna/research/{session}.json` |

## Current Caveats In This Checkout

- `runtime/images/Dockerfile` sets `UV_CACHE_DIR=/opt/tahuna/.uv-cache`. The repo instruction mentions a runtime image CI guardrail for `runtime/images/Dockerfile` and `.github/workflows/build-templates.yml`, but `.github/workflows/build-templates.yml` was not present in this checkout at review time.
- `specs/run-lifecycle.md` contains some older wording, such as future queue notes and a `/api/catalog` reference. The current code uses `/api/gpus` for GPU/image catalog in the CLI.
- Auto-Research is intentionally local. There is no separate backend table or runtime mode for it.
- Current runtime image catalog in `web/convex/runtime-images.json` lists PyTorch (`pt`) entries. The broader architecture can support other frameworks, but the catalog is what actually provisions.
