# Spec: Pod Bootstrap & Runtime

## Scope

This document describes the run-mode bootstrap path that runs inside a Runpod GPU pod from startup to training completion. It materializes code/data, installs dependencies, runs the entrypoint, extracts metrics, uploads artifacts, and reports status back to the Tahuna backend.

Warden now also has a serve mode. The serving lifecycle, serve runtime callback contract, readiness/liveness behavior, and `/workspace/model` materialization are defined in `specs/python-inference-app-contract.md`.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Warden runtime | Embedded Go binary | Bundled into Tahuna runtime image and launched as pod entrypoint |
| Runtime token | Bearer token | One-time credential for pod -> backend auth |
| Workspace | Pod filesystem | `/workspace` — root for code, data, and outputs |
| Bootstrap plan | JSON response | Code/data manifest entries + signed download URLs |

### Pod Environment Variables

| Variable | Description |
|----------|-------------|
| `TAHUNA_RUN_ID` | Run UUID |
| `TAHUNA_API_BASE` | Backend URL for runtime callbacks |
| `TAHUNA_RUNTIME_TOKEN` | Bearer token for all runtime API calls |
| `TAHUNA_WORKSPACE_ROOT` | Workspace path (default: `/workspace`) |

### Workspace Layout

```
/workspace/
  train.py              # entrypoint (from code manifest)
  pyproject.toml        # dependencies/runtime metadata (from code manifest)
  uv.lock               # locked dependency graph (from code manifest)
  ...                   # other code files
  data/                 # extracted data directory
  outputs/              # training outputs (or configured project output dir)
```

## Lifecycle

### Bootstrap Sequence

```
POD STARTS
    |
    v
1. REPORT STATUS: provisioning
   POST /api/runs/{RUN_ID}/runtime/status
   Body: { status: "provisioning", message: "warden bootstrap started" }
    |
    v
2. FETCH BOOTSTRAP PLAN
   GET /api/runs/{RUN_ID}/runtime/bootstrap
   Headers: Authorization: Bearer {RUNTIME_TOKEN}
   Response: {
     code: { entries: [...] },
     data: { entries: [...] },
     command: [...],   # pinned at run creation from environment.command — never empty
     output_dir: "..." # pinned at run creation from environment.outputDir
   }
   - each bootstrap entry already carries a signed download URL
   - command is always provided by the backend. Warden has no default and will fail
     if command is empty — this indicates a provisioning bug, not a warden concern.
    |
    v
3. MATERIALIZE CODE
   For each entry in code.entries:
     a. Download from signed URL
     b. Verify SHA256 hash matches entry.sha256
     c. Write to /workspace/{entry.path}
     d. Set file permissions from entry.mode
   Log progress to backend.
    |
    v
4. MATERIALIZE DATA
   For each entry in data.entries:
     a. Download from signed URL
     b. Verify SHA256 hash
     c. If data_bundle.tar.gz: extract to /workspace/data/
     d. Else: write to /workspace/data/{entry.path}
    |
    v
5. INSTALL DEPENDENCIES
   - Use uv as the default runtime package manager.
   - Training runtime installs the base dependency set plus the fixed `train` group.
   - If `uv.lock` exists: `uv sync --frozen --no-dev --inexact --group train`
   - If `uv.lock` missing but `pyproject.toml` exists: `uv sync --no-dev --inexact --group train`
   - If Warden is running inside a prebaked virtualenv, include `--active`.
   - If `pyproject.toml` missing: report FAILED (bootstrap contract violation)
   - Stream install output to:
     POST /api/runs/{RUN_ID}/runtime/logs
     Body: { level: "info", source: "bootstrap", message: "..." }
   - On install failure: report FAILED status and exit
    |
    v
6. REPORT STATUS: running
   POST /api/runs/{RUN_ID}/runtime/status
   Body: { status: "running", message: "workspace materialized" }
    |
    v
7. RUN ENTRYPOINT
   - Use the pinned bootstrap `command`
   - Execute with subprocess, capture stdout + stderr
   - Stream output to backend as logs:
     POST /api/runs/{RUN_ID}/runtime/logs
     Body: { level: "info"/"error", source: "training", message: "..." }
    |
    v
8. EXTRACT METRICS (concurrent with step 7)
   Two modes, tried in order:
   a. Tahuna tracking SDK (future):
      - Training code calls tahuna_track.log({"loss": 0.42})
      - SDK posts directly to backend
   b. Stdout regex fallback:
      - Pattern: (\w+)=([\d.]+(?:e[+-]?\d+)?)
      - Each match -> POST /api/runs/{RUN_ID}/runtime/metrics
        Body: { name: "loss", value: 0.42, step: N, timestamp: "..." }
    |
    v
9. PERIODIC OUTPUT SYNC (future)
   - Every configured interval (`RUN_OUTPUT_SYNC_INTERVAL_SECONDS`):
     a. Walk /workspace/outputs/
     b. Upload new/changed files to R2
     c. POST progress to backend
   - If this sync stops (pod crash), backend detects and terminates pod
    |
    v
10. ENTRYPOINT EXITS
   |
   +-- exit 0 -----> UPLOAD ARTIFACTS (step 11)
   |
   +-- exit != 0 --> REPORT FAILED
                     POST /api/runs/{RUN_ID}/runtime/status
                     Body: { status: "failed", error: "Exit code: N" }
                     TERMINATE
    |
    v
11. UPLOAD ARTIFACTS
    Walk /workspace/outputs/:
    For each file:
      a. POST /api/runs/{RUN_ID}/runtime/artifacts/upload-url
         Response: { upload_url: "...", key: "runs/<envId>/<ts>/output/<filename>" }
      b. PUT file to signed R2 URL
    Commit:
      POST /api/runs/{RUN_ID}/runtime/artifacts/commit
      Body: { keys: ["runs/.../<filename>", ...] }
    Note: upload failures emit warnings but do NOT change run status.
    |
    v
12. REPORT COMPLETED
    POST /api/runs/{RUN_ID}/runtime/status
    Body: { status: "completed" }
    |
    v
POD TERMINATES
```

### Cancellation Handling

```
Pod receives SIGTERM (from cancel request):
  |
  |-- Forward SIGTERM to entrypoint process
  |-- Queue checkpoint/save request in training process (non-blocking)
  |-- Start configured grace timer (from shared config)
  |-- If entrypoint exits within grace window:
  |     Upload any artifacts in output directory
  |     Report status: cancelled
  |-- If grace window expires:
  |     Force kill entrypoint
  |     Upload any artifacts already written
  |     Report status: cancelled
  |
  |-- --force cancellation:
       Immediate SIGKILL, no artifact upload
       Report status: cancelled
```

### Pod Image Selection

| Framework | Image |
|-----------|-------|
| PyTorch 2.x | Tahuna-managed image with CUDA + PyTorch preinstalled (GPU-specific CUDA compatibility) |
| TensorFlow 2.x | Tahuna-managed image with CUDA + TensorFlow preinstalled (GPU-specific CUDA compatibility) |
| Custom (future) | User-provided Docker image URI |

- Framework + version + Python version are detected from uv files (`pyproject.toml`, `uv.lock`).
- Image includes: Python, CUDA drivers, uv, and basic system tools.
- Image does NOT include: user code, data, or project-specific dependencies.

### Pod Networking

| Rule | Description |
|------|-------------|
| Default | Restricted: pod can only reach Tahuna backend + uv/pip package registries |
| User override | Configurable: user can enable full internet access per environment |
| Always allowed | Tahuna API base, PyPI, conda-forge (future) |
| Always blocked | Nothing explicitly blocked if user enables full access |

## Runtime API Endpoints (pod -> backend)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs/{id}/runtime/bootstrap` | GET | Fetch bootstrap plan (manifests + download URLs) |
| `/api/runs/{id}/runtime/status` | POST | Report status transition |
| `/api/runs/{id}/runtime/logs` | POST | Stream log lines |
| `/api/runs/{id}/runtime/metrics` | POST | Report extracted metrics |
| `/api/runs/{id}/runtime/artifacts/upload-url` | POST | Request signed upload URL for artifact |
| `/api/runs/{id}/runtime/artifacts/commit` | POST | Commit artifact keys to run record |

All runtime endpoints require `Authorization: Bearer {RUNTIME_TOKEN}`.

## Invariants

- Pod workspace is reconstructed exclusively from pinned manifests. No mutable state from previous runs.
- File integrity is verified by SHA256 hash after every download. Hash mismatch = bootstrap failure.
- Runtime token is valid only for the specific run it was created for.
- Artifact upload failures never change run completion status.
- Pod is ephemeral. After termination, local pod state is lost except artifacts already synced from selected output directory to Storage/R2.
- The runtime is a self-contained Go binary (`/usr/local/bin/warden`) embedded in the pod image.

## Shared Defaults & Constants

- Retry counts, grace windows, periodic sync intervals, and runtime timeout values are defined in `web/config.ts`.
- Bootstrap logs/messages should reference configured values, not hardcoded literals.

## Error States

| Condition | Behavior |
|-----------|----------|
| Bootstrap plan fetch fails | Retry up to configured max attempts. If still failing: report FAILED. |
| File hash mismatch | Report FAILED: "Integrity check failed for <path>." |
| Dependency install fails | Report FAILED: "uv sync failed: <error>." |
| Entrypoint not found | Report FAILED: "Entrypoint <file> not found." |
| Runtime token rejected | All API calls fail with 401. Pod has no fallback. |
| R2 download fails | Retry up to configured max attempts per file. If still failing: report FAILED. |
| Artifact upload fails | Warn in logs. Run status remains `completed`. |

## Dependencies

- Sync (manifests and blobs must exist in R2)
- Auth (runtime token validation)
- Runpod (pod provisioning and lifecycle)
- R2 (blob download, artifact upload)
- Run lifecycle (status reporting)
