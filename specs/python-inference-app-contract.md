# Spec: Python Inference App Contract

## Status

This document is the canonical Tahuna contract for Python application serving.

For Python app serving, it supersedes the engine-matrix model described in `specs/serve.md`.

`specs/serve.md` remains historical context only unless it is rewritten to align with this document.

## Implementation Status

This section is non-normative. It records rollout status in the current codebase as of 2026-04-01.

- PR1 is done.
  This document is the canonical Python app serving contract and supersedes `specs/serve.md` for Python app serving.
- PR2 is in progress, with canonical root config and local-authoritative sync already landed.
  Root `tahuna.toml` support and `[train]` / `[serve]` parsing and validation exist in `cli/project.go`, `tahuna init` scaffolds `train.py`, `inference.py`, `pyproject.toml`, and `uv.lock` in `cli/commands_core.go`, and `tahuna sync` / `tahuna env update` now push resolved environment, train, and serve config from local `tahuna.toml` instead of refreshing that file from the remote environment first.
- PR3 is done.
  `runtime/warden/internal/deps` now owns Python dependency installation with explicit `train` and `serve` modes, `runtime/warden/internal/bootstrap` dispatches separate run and serve orchestration paths, and shared virtualenv environment handling lives in `runtime/warden/internal/pythonenv`.
  The protected-package lockfile check reads `uv.lock` with `github.com/BurntSushi/toml` instead of manual line parsing.
- PR4 is done.
  The control plane now has canonical `serves`, `serveEvents`, and `serveRuntimeLogs` records, serve lifecycle status transitions, serve runtime log/status ingestion, and `/api/serves` HTTP routes including runtime callback endpoints.
- PR5 is done.
  Serve creation now requires exactly one model source (`from_run_id` or `from_storage_prefix`), copies model objects into a serve-owned immutable prefix under `serves/<environmentId>/.../model`, writes a pinned snapshot manifest JSON, and persists `objectPrefix`, `manifestKey`, `manifestHash`, `objectCount`, and `totalBytes` on the serve row.
- PR6 is done.
  Serve bootstrap now resolves concrete model download entries from the pinned snapshot manifest, `runtime/warden` materializes `/workspace/model`, installs base dependencies plus the `serve` group only, launches the serve command, sets serve runtime env vars, and supervises readiness/liveness with serve status callbacks.
- PR7 is done.
  Serve creation now enqueues real backend provisioning, resolves a canonical serve runtime launch spec, launches compute in Warden serve mode, reconciles runtime callbacks into canonical serve status transitions, and tears down serve compute on stop and failure paths.
- PR8 is still pending.
  The backend no longer requires manual provisioning work, but the product still lacks canonical CLI `tahuna serve ...` commands.
- PR9 is in progress.
  The dashboard already exposes synced serving config, but end-to-end serve workflows, examples, and final documentation are still incomplete.
- The next implementation step is PR8.
  The backend provisioning path is real, but the product still lacks canonical CLI `tahuna serve ...` flows.

## Scope

This contract defines the project, runtime, and lifecycle requirements for Tahuna projects where:

- the user owns the Python application code
- `train.py` is the canonical training entrypoint
- `inference.py` is the canonical serving entrypoint
- training and serving install separate dependency groups from one Python project

This contract is intentionally app-centric rather than engine-centric.

Tahuna owns:

- environment provisioning
- code, data, and model snapshot materialization
- runtime lifecycle supervision
- status and log collection
- readiness and liveness enforcement

The user owns:

- Python application code
- dependency declarations
- model loading logic
- inference request and response handling

## Principles

1. One canonical entrypoint per mode.
   Training runs `python -u train.py`. Serving runs `python -u inference.py`.

2. One canonical project layout.
   Tahuna expects root-level project files and does not rely on `.tahuna/tahuna.toml` for new projects.

3. Local project config is authoritative.
   Root `tahuna.toml` is the source of truth for synced environment, train, and serve config. `tahuna sync` and `tahuna env update` push resolved values from this file to the backend.

4. Separate dependency surfaces.
   Training installs the `train` dependency group. Serving installs the `serve` dependency group. Shared dependencies live in base project dependencies.

5. User-defined Python inference stack.
   Tahuna does not care whether `inference.py` uses `vllm`, `sglang`, `transformers`, `fastapi`, `uvicorn`, `litserve`, or plain HTTP code, as long as it satisfies this runtime contract.

6. Tahuna-managed lifecycle.
   The Python app is user-defined, but readiness gating, health enforcement, stop semantics, and snapshot pinning are Tahuna-managed.

7. Snapshot, not mutable prefix.
   Serving always runs from a pinned model snapshot resolved at serve creation time.

8. Python apps only.
   This contract covers Python entrypoints executed by `python -u ...`. It does not cover non-Python serving binaries.

## Canonical Project Files

Canonical root-level files:

- `tahuna.toml`
- `pyproject.toml`
- `uv.lock`
- `train.py`
- `inference.py`

Optional project files may exist, but these files define the Tahuna contract.

Legacy `.tahuna/tahuna.toml` is migration-only and is not part of the canonical contract for new projects.

`.tahuna/` is reserved for local state such as links and sync cache. It is not the canonical source of project runtime intent.

## Project Config

Projects define runtime intent in a root `tahuna.toml`.

This file is the source of truth for synced environment, train, and serve config.

Rules:

- `tahuna env update` edits local `tahuna.toml`
- `tahuna sync` pushes resolved config from local `tahuna.toml` to the backend
- sync must not overwrite local `tahuna.toml` from remote environment state during normal operation

Example:

```toml
[project]
data_dir = "data"
output_dir = "outputs"

[environment]
framework = "pt"
version = "2.8.0"
python_version = "3.11"
gpu_type = "NVIDIA A100-SXM4-80GB"
gpu_count = 1
volume_gb = 120

[train]
output_model_path = "outputs/model"

[serve]
python_version = "3.11"
gpu_type = "NVIDIA L40S"
gpu_count = 1
volume_gb = 120
port = 8000
health_path = "/health"
default_model_path = "outputs/model"
startup_timeout_seconds = 900
health_interval_seconds = 5
health_timeout_seconds = 2
health_failure_threshold = 3
graceful_shutdown_seconds = 30
```

## Config Semantics

### `[project]`

Shared workspace bindings:

- `data_dir`
- `output_dir`

Rules:

- both values are relative project paths
- neither value may escape the workspace root
- Tahuna materializes and uses these directories inside `/workspace`

### `[environment]`

Training-oriented environment settings:

- `framework`
- `version`
- `python_version`
- `gpu_type`
- `gpu_count`
- `volume_gb`

Rules:

- `[environment]` governs training by default
- these fields do not implicitly define serving behavior
- serving compute is configured separately in `[serve]`

### `[train]`

Training-specific config:

- `output_model_path`

Defaults:

- `output_model_path = "outputs/model"`

Rules:

- `train.py` is fixed and is not configurable in MVP
- the training dependency group is fixed to `train`
- `output_model_path` is a workspace-relative path under `[project].output_dir`

### `[serve]`

Serving-specific config:

- `python_version`
- `gpu_type`
- `gpu_count`
- `volume_gb`
- `port`
- `health_path`
- `default_model_path`
- `startup_timeout_seconds`
- `health_interval_seconds`
- `health_timeout_seconds`
- `health_failure_threshold`
- `graceful_shutdown_seconds`

Defaults:

- `python_version = [environment].python_version`
- `port = 8000`
- `health_path = "/health"`
- `default_model_path = "outputs/model"`
- `startup_timeout_seconds = 900`
- `health_interval_seconds = 5`
- `health_timeout_seconds = 2`
- `health_failure_threshold = 3`
- `graceful_shutdown_seconds = 30`

Rules:

- the default serve command is `python -u inference.py`
- `[serve].command` may override the exact serving launch command
- the serving dependency group is fixed to `serve`
- `default_model_path` is only a default lookup path inside a run output tree
- serving compute must be explicit and must not be inferred from `[environment]` except for the `python_version` default

## Dependency Contract

Tahuna uses one Python project with separate dependency groups.

Canonical dependency sources:

- `pyproject.toml`
- `uv.lock`

Recommended shape:

```toml
[project]
dependencies = [
  "huggingface-hub",
  "safetensors",
]

[dependency-groups]
train = [
  "torch",
  "transformers",
  "datasets",
  "peft",
]
serve = [
  "vllm",
  "fastapi",
  "uvicorn",
]
```

Rules:

- base project dependencies are shared across training and serving
- `train` dependencies are installed only for `tahuna train`
- `serve` dependencies are installed only for `tahuna serve`
- dependency group names are fixed to `train` and `serve`
- the lockfile must pin both dependency surfaces
- Tahuna must not infer dependencies by scanning imports

### Install Semantics

Training runtime installs the base dependency set plus the `train` group.

Serving runtime installs the base dependency set plus the `serve` group.

Reference commands:

```text
uv sync --active --frozen --group train
uv sync --active --frozen --group serve
```

The exact flag spelling may evolve, but the normative contract is:

- install from `pyproject.toml` and `uv.lock`
- honor the lockfile
- install only the dependency set for the active mode

## Training Contract

### Entrypoint

Tahuna launches training with:

```text
python -u train.py
```

No alternate training entrypoint is part of the MVP contract.

### Runtime Expectations

`train.py`:

- reads code and data from the materialized workspace
- writes outputs under `[project].output_dir`
- may write a serveable model directory under `[train].output_model_path`

Training is one-shot:

- the process starts
- the process runs to completion
- exit code `0` is success
- non-zero exit is failure

Tahuna does not require a specific training framework inside `train.py` beyond what the configured environment supports.

## Serving Contract

### Entrypoint

Tahuna launches serving with:

```text
python -u inference.py
```

This is the default serve command.

If `[serve].command` is configured, Tahuna launches serving with that command instead.

### Runtime Expectations

`inference.py` must:

- start exactly one long-lived HTTP server process tree
- bind to `0.0.0.0:$TAHUNA_SERVE_PORT`
- return HTTP `200` on `$TAHUNA_SERVE_HEALTH_PATH` when ready
- remain running until it is stopped or fails

`inference.py` may:

- load the model from `TAHUNA_MODEL_ROOT`
- use any Python inference library declared in the `serve` dependency group
- expose any request and response protocol the user wants

Tahuna does not define the inference payload schema in this contract. Tahuna only defines readiness and lifecycle.

### User Traffic Boundary

Tahuna owns the public inference edge.

Rules:

- end users and clients must call Tahuna API routes to talk to a serve
- direct provider URLs such as public RunPod proxy URLs are not part of the canonical user-facing contract
- Tahuna authenticates user inference requests with normal user session or API-key auth before proxying them to the running serve
- `inference.py` is responsible for inference behavior only; it is not responsible for validating Tahuna user sessions or API keys
- `inference.py` should assume proxied HTTP traffic from Tahuna on the configured serve port

### Process Ownership

Tahuna supervises the process tree rooted at the resolved serve command.

Rules:

- the serve process must not depend on a separate unmanaged long-lived daemon
- the user app may fork worker processes if they remain part of the supervised process tree
- process exit after the serve becomes healthy is a runtime failure unless the stop was user-initiated

## Model Contract

Serving is snapshot-based.

At serve creation time Tahuna resolves a model source to a pinned model snapshot.

Allowed model sources:

- a model directory produced by a successful training run
- a model directory already stored in Tahuna-managed object storage

MVP serve creation must require exactly one model source.

Supported source selectors:

- `--from-run <run_id>`
- `--from-storage <object-prefix>`

Tahuna must never infer "latest successful run" or any equivalent implicit source.

When `--from-run <run_id>` is used and no explicit model subpath is provided, Tahuna resolves the model from `[serve].default_model_path` inside that run output tree.

Tahuna materializes the pinned model snapshot under:

```text
/workspace/model
```

and sets:

- `TAHUNA_MODEL_ROOT=/workspace/model`

Rules:

- the snapshot must not change after serve creation
- running serves must not read directly from mutable run artifact prefixes
- renaming or deleting the source run artifacts or source storage objects must not mutate a running serve
- `inference.py` must treat `TAHUNA_MODEL_ROOT` as read-only model input

## Runtime Environment Variables

### Shared

| Variable | Description |
|----------|-------------|
| `TAHUNA_WORKSPACE_ROOT` | Workspace root. Always `/workspace`. |
| `TAHUNA_DATA_DIR` | Materialized data directory under `/workspace/<project.data_dir>`. |
| `TAHUNA_OUTPUT_DIR` | Output directory under `/workspace/<project.output_dir>`. |
| `TAHUNA_API_BASE` | Backend URL for runtime callbacks. |
| `TAHUNA_RUNTIME_TOKEN` | Runtime bearer token for runtime callbacks. |

Rules:

- `TAHUNA_DATA_DIR` and `TAHUNA_OUTPUT_DIR` must exist before launching the entrypoint
- all Tahuna-provided paths are absolute paths inside `/workspace`

### Training

| Variable | Description |
|----------|-------------|
| `TAHUNA_RUN_ID` | Training run ID. |

### Serving

| Variable | Description |
|----------|-------------|
| `TAHUNA_SERVE_ID` | Serve ID. |
| `TAHUNA_MODEL_ROOT` | Materialized model snapshot root. Always `/workspace/model`. |
| `TAHUNA_SERVE_PORT` | Port the app must bind to. |
| `TAHUNA_SERVE_HEALTH_PATH` | Readiness and liveness path. |

## Runtime Callback Contract

The runtime must communicate with the Tahuna control plane using a one-time runtime token.

Serving callback surface:

- `GET /api/serves/{serve_id}/runtime/bootstrap`
- `POST /api/serves/{serve_id}/runtime/status`
- `POST /api/serves/{serve_id}/runtime/logs`

Training callback surface remains the run-specific contract and is separate from serving.

The exact payloads may be specified separately, but the serving contract requires:

- bootstrap delivery of the code, optional data, and pinned model materialization plan plus runtime settings
- status updates for serve lifecycle transitions
- log streaming or batched log upload from the supervised process

The runtime token is an internal control-plane credential only.

Rules:

- `TAHUNA_RUNTIME_TOKEN` authenticates Warden-to-Tahuna runtime callbacks only
- `TAHUNA_RUNTIME_TOKEN` is not a user credential and is not the public serve authentication model
- user inference requests must not be sent directly to the runtime callback surface

## User Inference Access Contract

Tahuna proxies user inference traffic to the running serve after authenticating and authorizing the caller.

This contract intentionally does not freeze the external inference payload schema, but it does freeze the ownership boundary:

- Tahuna API is the only canonical public entrypoint for a serve
- the backing serve process listens on the internal configured HTTP port only
- public access must not require users to discover or call provider-specific pod URLs
- the provider network endpoint is replaceable infrastructure detail, not product contract
- Tahuna may preserve the app-defined HTTP method, path, headers, and body when proxying, subject to future API-surface rules

## Readiness And Health

Serving status is health-driven.

Tahuna probes:

```text
http://127.0.0.1:{TAHUNA_SERVE_PORT}{TAHUNA_SERVE_HEALTH_PATH}
```

Probe success is defined as:

- HTTP status `200`

Probe response body is ignored by the contract.

### Startup

Startup rules:

- the serve enters `starting` after provisioning completes and before readiness succeeds
- if readiness does not succeed before `[serve].startup_timeout_seconds`, the serve fails
- if the process exits before the first successful readiness probe, the serve fails

### Healthy Operation

After readiness succeeds:

- the serve enters `serving`
- Tahuna continues local health probing
- process exit is immediate failure unless a stop was requested
- `health_failure_threshold` consecutive failed probes mark the serve failed

### Health Ownership Boundary

Tahuna owns:

- the probe loop
- state transitions
- stop and fail handling

The user owns:

- implementing the health endpoint in `inference.py`
- deciding when the app is actually ready to answer traffic

## Serve Lifecycle

### State Machine

Serving uses the following states:

- `queued`
- `provisioning`
- `starting`
- `serving`
- `stopping`
- `stopped`
- `failed`

### Transition Semantics

Allowed lifecycle semantics:

- create request inserts `queued`
- compute allocation and materialization transition to `provisioning`
- process launch transitions to `starting`
- first successful readiness probe transitions to `serving`
- user stop request transitions to `stopping`
- graceful stop completion transitions to `stopped`
- unrecoverable runtime error, process exit, startup timeout, or sustained health failure transitions to `failed`

### Stop Semantics

On user stop:

1. Tahuna transitions the serve to `stopping`.
2. Tahuna sends `SIGTERM` to the supervised process tree.
3. Tahuna waits up to `[serve].graceful_shutdown_seconds`.
4. If the process tree is still alive, Tahuna force kills it.
5. Tahuna transitions the serve to `stopped`.

If the process exits on its own after a stop request, the terminal state is still `stopped`, not `failed`.

## Image And Runtime Resolution

This contract is not engine-matrix-based.

Tahuna is responsible for selecting a compatible Python runtime image that satisfies:

- the requested Python version
- the requested compute shape
- the runtime requirements for GPU execution

Rules:

- user libraries such as `vllm`, `sglang`, `transformers`, `fastapi`, or `uvicorn` come from `pyproject.toml` and `uv.lock`
- Tahuna must not require the user to select a serving engine in `tahuna.toml`
- Tahuna must not infer serving behavior from dependency names

## Clarification On `triton`

This contract allows arbitrary Python dependencies.

That means a Python package named `triton` may appear in dependencies.

This contract does not mean Tahuna supports NVIDIA Triton Inference Server.

The binary `tritonserver` is a different runtime contract and is out of scope for MVP.

## Explicit Non-Goals

- non-Python serving binaries such as `tritonserver`
- user-provided Docker images
- model serving by pointing directly at mutable run artifacts
- direct public provider endpoints as the canonical user-facing inference access model
- automatic inference payload schema
- artifact upload from serve pods in MVP
- autoscaling in MVP
- rolling updates or blue-green deployment in MVP
- multi-model serving in MVP

## Invariants

- `train.py` is the canonical training entrypoint
- `inference.py` is the canonical serving entrypoint
- canonical project files live at repo root
- training and serving dependency sets are separate and fixed to `train` and `serve`
- Tahuna installs dependencies from `pyproject.toml` and `uv.lock`
- serving uses a pinned model snapshot at `TAHUNA_MODEL_ROOT`
- serving health is determined by a local HTTP probe
- Tahuna manages infrastructure and lifecycle; the user manages Python app behavior
- user-facing inference access terminates at Tahuna API, not at raw provider pod URLs
- `TAHUNA_RUNTIME_TOKEN` is internal-only and is not user auth

## Acceptance Criteria

The implementation satisfies this contract only if all of the following are true:

- a project with root `tahuna.toml`, `pyproject.toml`, `uv.lock`, `train.py`, and `inference.py` can train and serve without any path overrides
- training installs base dependencies plus `train`, but not `serve`
- serving installs base dependencies plus `serve`, but not `train`
- `tahuna serve create --from-run <run_id>` snapshots the model directory and starts `inference.py`
- a running serve remains healthy if the source run artifacts are renamed or deleted after snapshot creation
- a serve that never returns HTTP `200` on the health endpoint fails after `[serve].startup_timeout_seconds`
- a serve that exits after becoming healthy transitions to `failed`
- a stopped serve transitions to `stopped`, not `failed`
- `TAHUNA_WORKSPACE_ROOT`, `TAHUNA_MODEL_ROOT`, `TAHUNA_DATA_DIR`, and `TAHUNA_OUTPUT_DIR` are absolute paths inside `/workspace`
- the implementation does not require engine selection in `tahuna.toml`
- a user can invoke a running serve through Tahuna-authenticated API access without calling a provider-specific pod URL directly

## Suggested Implementation PR Order

This section is non-normative. It exists to guide implementation sequencing.

1. PR1: Spec alignment. Status: done.
   Rewrite the Python serving contract, mark `specs/serve.md` as superseded for Python app serving, and align product language.

2. PR2: Config contract and migration. Status: in progress.
   Add root `tahuna.toml` support, introduce `[train]` and `[serve]`, migrate from legacy `.tahuna/tahuna.toml`, update project scaffolding, and make local `tahuna.toml` the source of truth for synced config.

3. PR3: Mode-aware dependency installation. Status: done.
   Refactor runtime dependency installation so training installs base plus `train`, and serving installs base plus `serve`.

4. PR4: Serve control-plane primitives. Status: done.
   Add serve records, serve events, serve runtime logs, serve status transitions, and serve HTTP routes.

5. PR5: Immutable model snapshots. Status: done.
   Add serve-time model snapshot resolution from runs or storage and pin that snapshot in control-plane state.

6. PR6: Warden serve mode. Status: done.
   Generalize the runtime bootstrap path to support serving, model materialization, process supervision, readiness polling, liveness polling, and stop semantics.

7. PR7: Serve provisioning backend. Status: done.
   Add backend provisioning orchestration for create, start, stop, failure handling, and runtime callbacks.

8. PR8: CLI serve commands. Status: pending.
   Add `tahuna serve create`, `list`, `show`, `logs`, and `stop`.

9. PR9: Docs, examples, and dashboard. Status: in progress.
   The dashboard already shows synced serving config, but examples and end-to-end serve UX should only be finalized after the backend and runtime path are working.
