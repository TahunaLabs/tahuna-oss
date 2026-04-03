# Spec: Environments

## Scope

An environment is a named, user-scoped container that holds runtime configuration (GPU, framework, Python), sync state (code/data manifest pointers), data bindings, and is the parent of all runs. One environment per project. Created exclusively via `tahuna init`.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Environment record | Convex table row | `environments` table entry |
| `.tahuna/environment_id` | Local file | Links local project to remote environment |
| Code manifest pointer | Field | `latestCodeManifestHash` — latest synced code version |
| Primary data manifest pointer | Field | `latestDataManifestHash` — default data version for new runs |
| Additional data bindings | Field | `boundDataManifestHashes` — additional data/manifests linked to environment |
| Runs | Child records | All runs belong to exactly one environment |

### Environment Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Owner (from API key auth) |
| `name` | string | User-chosen name (from init) |
| `framework` | string | `"pytorch"` or `"tensorflow"` |
| `version` | string | Framework version (e.g., `"2.1.0"`) |
| `pythonVersion` | string | Python runtime version detected from uv files (e.g., `"3.11"`) |
| `gpuType` | string | Default GPU type (e.g., `"NVIDIA A100 80GB"`) |
| `gpuCount` | number | Default GPU count |
| `volumeGb` | number | Default volume size in GB |
| `trainDependencyGroup` | string? | Resolved training dependency selection; `""` means base `[project.dependencies]` |
| `latestCodeManifestHash` | string? | SHA256 of latest code manifest |
| `latestDataManifestHash` | string? | SHA256 of latest data manifest |
| `boundDataManifestHashes` | string[] | Additional data manifests bound to this environment |
| `latestSyncAt` | number? | Timestamp of last sync commit |
| `command` | string[] | Pinned entrypoint command (set at init, updated by sync commit) |
| `outputDir` | string | Output directory name relative to workspace root (default: `"outputs"`) |
| `serveSnapshot` | object? | Optional serving launch spec, present only when serving is enabled |
| `artifacts` | string? | Legacy field (R2 artifact prefix) |
| `dataId` | string? | Legacy field (data blob ID) |

## Lifecycle

### Creation

- Triggered by: `tahuna init` only
- Creates one environment record on the backend
- Links to local project via `.tahuna/environment_id`
- Followed immediately by a config-only sync that writes the resolved train dependency selection and optional serve snapshot
- No other creation path exists (dashboard cannot create environments)

### Read Operations

| Command | Endpoint | Description |
|---------|----------|-------------|
| `tahuna env list` | `GET /api/environments` | List all user environments |
| `tahuna env show --id <id>` | `GET /api/environments/{id}` | Show single environment details |

### Update Operations

| Command | Endpoint | Fields |
|---------|----------|--------|
| `tahuna env update [id]` | `PATCH /api/environments/{id}` | `gpu_type`, `gpu_count`, `volume_gb` |
| `tahuna env specs` | Alias for `env update` | Same |
| `tahuna env data bind <env-id> <data-id...>` | `POST /api/environments/{id}/data-bindings` | Add one or many data bindings |
| `tahuna env data unbind <env-id> <data-id...>` | `DELETE /api/environments/{id}/data-bindings` | Remove selected data bindings |

- Runtime spec updates are validated against the GPU catalog:
  - `gpu_type` must exist in available GPUs
  - `gpu_count` must not exceed max for that GPU type
  - `volume_gb` must be positive
- Manifest pointers (`latestCodeManifestHash`, `latestDataManifestHash`) are updated only by the sync commit endpoint, never by direct user commands.
- `command`, `trainDependencyGroup`, `outputDir`, and optional `serveSnapshot` are set from local project config and updated on sync commit. They are the single source of truth for run/serve execution config — creation reads them from the environment, not from CLI payload.
- Additional data bindings are metadata links only (no blob copy).

### Deletion

| Command | Endpoint | Description |
|---------|----------|-------------|
| `tahuna env rm --id <id>` | `DELETE /api/environments/{id}` | Cascade delete |

**Cascade behavior:**
1. Delete all runs belonging to this environment (including run events, logs, metrics).
2. Delete all synced code/data blobs and manifests in R2 under this environment's prefix.
3. Delete the environment record.
4. CLI should also remove local `.tahuna/` if it matches.

### Pull (future)

- `tahuna pull` — list remote environments and link one to the current project directory.
- Creates `.tahuna/` or any tahuna related local files pointing to existing environment.
- Does not duplicate data.

## Spec Defaults and Overrides

```
Environment specs (gpu_type, gpu_count, volume_gb)
       |
       | used as defaults
       v
   Run creation (tahuna train / tahuna run create)
       |
       | can override with --gpu-type, --gpu-count, --volume-gb
       v
   Effective run specs (stored on run record)
       |
       | validated against GPU catalog guardrails
       v
   Pod provisioning (Runpod API)
```

- Environment specs are **defaults**, not hard constraints.
- Per-run overrides are validated against catalog limits (available GPU types, max count per type).
- Effective specs are stored on the run record for reproducibility.
- New runs can mount multiple bound data items from the environment.

## Invariants

- One project directory maps to exactly one environment.
- One environment belongs to exactly one user.
- Environment deletion cascades to all child resources (runs, blobs, manifests).
- Manifest pointers are only written by sync commit, never by user commands.
- The environment stores the resolved training dependency selection. `""` means base `[project.dependencies]`.
- `serveSnapshot` exists only when serving is enabled for the project.
- Framework and Python version are detected from uv files (`pyproject.toml`, `uv.lock`) and determine pod image selection.

## Error States

| Condition | Behavior |
|-----------|----------|
| Environment not found | Error: "Environment not found." (HTTP 404) |
| Environment belongs to different user | Error: "Access denied." (HTTP 403) |
| Invalid GPU type on update | Error: "GPU type not available. See `tahuna catalog gpus`." (HTTP 400) |
| GPU count exceeds max | Error: "Max GPU count for <type> is <N>." (HTTP 400) |
| Invalid data binding | Error: "Data item <id> is not available for this environment." (HTTP 400) |
| Delete with active runs | Runs in terminal states are deleted. Active runs are cancelled first, then deleted. |

## Dependencies

- Auth (user scoping)
- GPU catalog (spec validation)
- Sync system (manifest pointers)
- Runs (cascade deletion)
- R2 (blob/manifest storage)
