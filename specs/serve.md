# Spec: Model Serving & Inference

## Scope

`tahuna serve` provisions long-lived inference compute for a model and keeps a serving process healthy until the user stops it or the process fails.

This spec defines the MVP serving contract for a small Tahuna-managed engine matrix:

- `vllm`
- `llama.cpp`
- `onnxruntime`
- `triton` later

The design intentionally mirrors `tahuna train` structurally:

- CLI validates config against a server-side catalog
- the project keeps local runtime intent in `tahuna.toml`
- the backend resolves a compatible runtime image
- the pod runtime launches one canonical process and reports lifecycle events

The design intentionally differs from training semantically:

- serving is long-lived, not one-shot
- training framework does not determine serving engine
- the runtime image matrix is engine-based, not framework-based
- readiness + health determine success, not exit code `0`

## Principles

1. One canonical path per engine.
   Tahuna does not expose multiple launch modes for the same engine.

2. User chooses from a small supported matrix.
   The user selects an engine explicitly; Tahuna validates the combination and launches the matching image.

3. Serving config is separate from training config.
   Training framework/version and serving engine/version must not be conflated.

4. Serving is model-first.
   The runtime materializes model artifacts plus engine-required metadata, then launches the engine.

5. Serving uses a long-lived runtime contract.
   A serve is healthy only after readiness succeeds and remains healthy only while probes and the engine process stay alive.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Serve record | Control-plane row | Persistent record for one live serving deployment |
| Serve events | Control-plane rows | Immutable lifecycle audit log |
| Serve logs | Control-plane rows | Stdout/stderr from the engine process |
| Runtime token | Credential | One-time bearer token for pod -> backend communication |
| Pod | Compute resource | Long-lived compute instance running the serving engine |
| Model manifest | Manifest | Pinned model files to materialize into the pod |
| Serve catalog | Backend response | Supported engines, versions, Python versions, image names, and compatibility rules |

### Serve Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Owner |
| `environmentId` | string | Parent environment |
| `status` | enum | Current state |
| `engine` | string | `vllm`, `llama.cpp`, `onnxruntime`, or `triton` later |
| `engineVersion` | string | Selected engine version |
| `pythonVersion` | string | Selected Python version for the runtime image |
| `task` | string | `chat`, `completion`, `embeddings`, `rerank`, or `predict` |
| `modelRef` | string | Model reference from `tahuna.toml` |
| `imageName` | string | Resolved Tahuna runtime image |
| `podId` | string? | Provisioned compute identifier |
| `runtimeTokenHash` | string | SHA256 of pod runtime token |
| `port` | number | Internal engine port |
| `healthPath` | string | Readiness/liveness probe path |
| `endpointUrl` | string? | User-facing endpoint once healthy |
| `lastHealthAt` | string? | Timestamp of last successful health report |
| `error` | string? | Error message when failed |

## Supported Engine Matrix

Tahuna supports a small, explicit matrix. The catalog is the source of truth.

| Engine | Status | Artifact Format | Canonical Process |
|--------|--------|-----------------|-------------------|
| `vllm` | MVP | Hugging Face-style model directory / safetensors | `vllm serve ...` |
| `llama.cpp` | MVP | `gguf` | `llama-server ...` |
| `onnxruntime` | MVP | `onnx` | Tahuna-managed ONNX HTTP wrapper |
| `triton` | Later | engine-specific model repository | `tritonserver ...` |

### Engine Notes

- `vllm` is the default first-class path for LLM chat, completion, and embeddings.
- `llama.cpp` targets quantized local-style deployments where the artifact is already in `gguf`.
- `onnxruntime` is supported only through one Tahuna-managed server wrapper. Raw user-defined ORT launch commands are out of scope for MVP.
- `triton` is not part of the initial matrix. It is reserved for a later multi-model/mixed-backend phase.

## Project Config

Each project gets a dedicated `[serve]` block in `tahuna.toml`.

Example:

```toml
[serve]
engine = "vllm"
version = "0.8.5"
python_version = "3.11"
task = "chat"
model = "outputs/model"
port = 8000
health_path = "/health"

[serve.vllm]
max_model_len = 8192
tensor_parallel_size = 1
```

### Required Fields

| Field | Description |
|-------|-------------|
| `engine` | Serving engine choice |
| `version` | Engine version |
| `python_version` | Python version from the server-side catalog |
| `task` | Inference task family |
| `model` | Model path or remote model reference |

### Optional Fields

| Field | Description |
|-------|-------------|
| `port` | Internal serving port; default comes from the engine catalog |
| `health_path` | Probe path; default comes from the engine catalog |
| `[serve.<engine>]` | Engine-specific validated options |

### Config Rules

- `[serve]` is independent from `[environment]`.
- Training framework/version must not be reused as serving engine/version.
- Only Tahuna-supported fields are allowed in the top-level `[serve]` block.
- Engine-specific options are validated by engine type.

## Server-Side Catalog

`tahuna serve` validates engine/version/python against a server-side catalog the same way `tahuna train` validates framework/version/python today.

The serve catalog is authoritative for:

- supported engines
- supported engine versions
- supported Python versions per engine version
- compatible GPU / CPU targets
- canonical image name
- default port
- default health path
- allowed engine-specific options

Example logical response shape:

```json
{
  "engines": {
    "vllm": {
      "0.8.5": {
        "python_versions": ["3.11"],
        "image_name": "tahuna/serve-vllm:0.8.5-py3.11",
        "default_port": 8000,
        "health_path": "/health"
      }
    }
  }
}
```

### Validation Flow

```
1. Load [serve] from tahuna.toml
2. Fetch serve catalog from backend
3. Validate engine exists
4. Validate engine version exists
5. Validate python version is supported for that engine version
6. Validate engine-specific options
7. Resolve canonical image name
8. Create serve deployment
```

Interactive terminals may prompt the user to select a valid engine/version/python combination when the local config is invalid or incomplete.

## Lifecycle

### State Machine

```
                         +-----------+
                         |  QUEUED   |
                         +-----+-----+
                               |
                               v
                        +------+------+
                        |PROVISIONING |
                        +------+------+
                               |
                               v
                        +------+------+
                        |  STARTING   |
                        +------+------+
                               |
                   +-----------+-----------+
                   |                       |
            (readiness ok)         (readiness fails)
                   |                       |
                   v                       v
              +----+----+             +----+----+
              | SERVING |             | FAILED  |
              +----+----+             +---------+
                   |
         +---------+---------+
         |                   |
   (user stop/update)   (process exit /
         |               health failure)
         v                   |
   +-----+------+            |
   |  STOPPING  |            |
   +-----+------+            |
         |                   |
         v                   v
   +-----+-----+         +---+----+
   |  STOPPED  |         | FAILED |
   +-----------+         +--------+
```

### State Definitions

| State | Description | Terminal? |
|-------|-------------|-----------|
| `queued` | Serve record created, waiting for provisioning | No |
| `provisioning` | Pod creation requested | No |
| `starting` | Model is materializing and engine is starting | No |
| `serving` | Engine is healthy and endpoint is routable | No |
| `stopping` | User requested stop or replacement | No |
| `stopped` | Serve terminated intentionally | Yes |
| `failed` | Provisioning, launch, readiness, or liveness failure | Yes |

## Runtime Contract

Serving needs a long-lived runtime contract instead of the current training contract.

### Pod Environment Variables

| Variable | Description |
|----------|-------------|
| `TAHUNA_SERVE_ID` | Serve UUID |
| `TAHUNA_API_BASE` | Backend URL for runtime callbacks |
| `TAHUNA_RUNTIME_TOKEN` | Bearer token for serve runtime auth |
| `TAHUNA_WORKSPACE_ROOT` | Workspace root, default `/workspace` |
| `TAHUNA_MODEL_ROOT` | Materialized model directory |
| `TAHUNA_SERVE_ENGINE` | Selected engine |
| `TAHUNA_SERVE_PORT` | Internal serving port |
| `TAHUNA_SERVE_HEALTH_PATH` | Local health endpoint path |

### Workspace Layout

```
/workspace/
  model/                 # pinned model files and metadata
  logs/                  # optional local runtime logs
  tmp/                   # engine scratch space
```

### Bootstrap Sequence

```
POD STARTS
    |
    v
1. FETCH SERVE PLAN
   GET /api/serves/{SERVE_ID}/runtime/bootstrap
   Response includes:
   - engine
   - engine_version
   - python_version
   - image_name
   - command
   - model manifest / model reference
   - port
   - health path
    |
    v
2. REPORT STATUS: provisioning -> starting
    |
    v
3. MATERIALIZE MODEL
   - download pinned model files
   - verify hashes
   - write to /workspace/model
    |
    v
4. LAUNCH CANONICAL ENGINE PROCESS
   - one Tahuna-managed command template per engine
   - stdout/stderr streamed to backend
    |
    v
5. LOCAL READINESS PROBE LOOP
   - probe localhost:{port}{health_path}
   - require consecutive successful checks before marking healthy
    |
    +-- failure --> REPORT FAILED
    |
    v
6. REPORT STATUS: serving
   - endpoint becomes user-visible
    |
    v
7. LONG-LIVED HEALTH LOOP
   - continue readiness/liveness checks
   - emit periodic health heartbeats
   - if process exits or health fails: REPORT FAILED
    |
    v
8. STOP / REPLACE
   - transition to stopping
   - send graceful termination signal
   - tear down pod
   - transition to stopped
```

## Canonical Launch Path

Each engine has exactly one Tahuna-managed startup template.

| Engine | Canonical Launch Rule |
|--------|------------------------|
| `vllm` | Tahuna builds the final `vllm serve` command from validated `[serve]` config |
| `llama.cpp` | Tahuna builds the final `llama-server` command from validated `[serve]` config |
| `onnxruntime` | Tahuna launches a single internal ONNX HTTP wrapper with validated config |
| `triton` | Tahuna launches `tritonserver` later when the matrix expands |

Rules:

- No user-supplied arbitrary launch command in MVP
- No multiple wrappers per engine
- No per-project dependency install step before launch
- Engine images already include the engine runtime and its dependencies

## Health Checks

The runtime launches one canonical server process per engine and health-checks it.

### Readiness

- Readiness must pass before a serve enters `serving`.
- Probe target is local to the pod: `http://127.0.0.1:{port}{health_path}`.
- Tahuna requires consecutive successful checks before exposing the endpoint.

### Liveness

- Liveness continues for the life of the serve.
- Probe failures beyond a configured threshold mark the serve unhealthy and trigger failure handling.
- A dead process is an immediate failure even if the probe loop has not yet expired.

### Health Reporting

- Runtime posts successful health timestamps back to the backend.
- Backend uses missing heartbeats plus process failure signals to detect dead serves.

## Differences From Training

| Topic | `tahuna train` | `tahuna serve` |
|-------|----------------|----------------|
| Duration | one-shot | long-lived |
| Runtime key | framework/version/python | engine/version/python |
| Image matrix | framework-based | engine-based |
| Bootstrap goal | run entrypoint to completion | launch server and keep it healthy |
| Success condition | exit code `0` | readiness + sustained health |
| Dependency model | install project deps in pod | use prebuilt engine image |
| Metrics | training metrics | health + serving metrics later |

### Consequences

- Serving must not reuse the current training success model.
- Serving must not assume project code is the primary runtime artifact.
- Serving must not accept arbitrary user entrypoints in MVP.

## Non-Goals For MVP

- Arbitrary custom model servers
- User-provided Docker images
- Multi-model hosting in one pod
- Triton support in the first implementation
- Automatic engine inference from training framework

## Invariants

- The serve catalog is the single source of truth for supported engine/version/python combinations.
- `[serve]` config is validated before provisioning.
- One engine maps to one canonical launch path.
- A serve is not healthy until readiness succeeds.
- A serve stops being healthy when the process exits or health checks fail beyond threshold.
- Serving contract semantics remain separate from training contract semantics.
