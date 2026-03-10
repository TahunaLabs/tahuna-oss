# Spec: Pod Bootstrap & Runtime

## Scope

The pod bootstrap is the sequence that runs inside a Runpod GPU pod from startup to training completion. It materializes code/data, installs dependencies, runs the entrypoint, extracts metrics, uploads artifacts, and reports status back to the Tahuna backend.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Bootstrap script | Embedded Python | Injected into pod via Runpod env vars / CMD override |
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
  config.yaml           # config (from code manifest)
  requirements.txt      # dependencies (from code manifest)
  ...                   # other code files
  data/                 # extracted data directory
  outputs/              # training outputs (user writes here)
```

## Lifecycle

### Bootstrap Sequence

```
POD STARTS
    |
    v
1. FETCH BOOTSTRAP PLAN
   GET /api/runs/{RUN_ID}/runtime/bootstrap
   Headers: Authorization: Bearer {RUNTIME_TOKEN}
   Response: {
     code: { entries: [...], download_urls: {...} },
     data: { entries: [...], download_urls: {...} },
     entrypoint: "train.py",
     config_file: "config.yaml",
     requirements: "requirements.txt",
     output_dir: "outputs"
   }
    |
    v
2. REPORT STATUS: provisioning -> running
   POST /api/runs/{RUN_ID}/runtime/status
   Body: { status: "running" }
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
   - Detect package manager:
     a. If pyproject.toml present: use uv (future default)
     b. Else if requirements.txt present: pip install -r requirements.txt (current)
   - Stream install output to:
     POST /api/runs/{RUN_ID}/runtime/logs
     Body: { level: "info", source: "bootstrap", message: "..." }
   - On install failure: report FAILED status and exit
    |
    v
6. RUN ENTRYPOINT
   - Parse entrypoint command:
     a. Check config.yaml for `command:` field
     b. Default: `python3 -u {entrypoint}`
   - Execute with subprocess, capture stdout + stderr
   - Stream output to backend as logs:
     POST /api/runs/{RUN_ID}/runtime/logs
     Body: { level: "info"/"error", source: "training", message: "..." }
    |
    v
7. EXTRACT METRICS (concurrent with step 6)
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
8. PERIODIC OUTPUT SYNC (future)
   - Every N seconds (default: 60):
     a. Walk /workspace/outputs/
     b. Upload new/changed files to R2
     c. POST progress to backend
   - If this sync stops (pod crash), backend detects and terminates pod
    |
    v
9. ENTRYPOINT EXITS
   |
   +-- exit 0 -----> UPLOAD ARTIFACTS (step 10)
   |
   +-- exit != 0 --> REPORT FAILED
                     POST /api/runs/{RUN_ID}/runtime/status
                     Body: { status: "failed", error: "Exit code: N" }
                     TERMINATE
    |
    v
10. UPLOAD ARTIFACTS
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
11. REPORT COMPLETED
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
  |-- Start 30-second grace timer
  |-- If entrypoint exits within grace period:
  |     Upload any artifacts in output directory
  |     Report status: cancelled
  |-- If grace period expires:
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
| PyTorch 2.x | Tahuna-managed image with CUDA + PyTorch preinstalled |
| TensorFlow 2.x | Tahuna-managed image with CUDA + TensorFlow preinstalled |
| Custom (future) | User-provided Docker image URI |

- Framework + version detected from `requirements.txt` (single source of truth).
- Image includes: Python, CUDA drivers, uv (future), basic system tools.
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
- Pod is fully ephemeral. After termination, all local state is lost.
- The bootstrap script is self-contained Python with no external dependencies beyond the base image.

## Error States

| Condition | Behavior |
|-----------|----------|
| Bootstrap plan fetch fails | Retry 3 times. If still failing: report FAILED. |
| File hash mismatch | Report FAILED: "Integrity check failed for <path>." |
| Dependency install fails | Report FAILED: "pip install failed: <error>." |
| Entrypoint not found | Report FAILED: "Entrypoint <file> not found." |
| Runtime token rejected | All API calls fail with 401. Pod has no fallback. |
| R2 download fails | Retry 3 times per file. If still failing: report FAILED. |
| Artifact upload fails | Warn in logs. Run status remains COMPLETED. |

## Dependencies

- Sync (manifests and blobs must exist in R2)
- Auth (runtime token validation)
- Runpod (pod provisioning and lifecycle)
- R2 (blob download, artifact upload)
- Run lifecycle (status reporting)
