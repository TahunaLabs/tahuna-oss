# Spec: Environments

## Scope

An environment is a named, user-scoped container that holds runtime configuration (GPU, framework), sync state (code/data manifest pointers), and is the parent of all runs. One environment per project. Created exclusively via `tahuna init`.

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Environment record | Convex table row | `environments` table entry |
| `.tahuna/environment_id` | Local file | Links local project to remote environment |
| Code manifest pointer | Field | `latestCodeManifestHash` — latest synced code version |
| Data manifest pointer | Field | `latestDataManifestHash` — latest synced data version |
| Runs | Child records | All runs belong to exactly one environment |

### Environment Record Schema

| Field | Type | Description |
|-------|------|-------------|
| `userId` | string | Owner (from API key auth) |
| `name` | string | User-chosen name (from init) |
| `framework` | string | `"pytorch"` or `"tensorflow"` |
| `version` | string | Framework version (e.g., `"2.1.0"`) |
| `gpuType` | string | Default GPU type (e.g., `"NVIDIA A100 80GB"`) |
| `gpuCount` | number | Default GPU count |
| `volumeGb` | number | Default volume size in GB |
| `latestCodeManifestHash` | string? | SHA256 of latest code manifest |
| `latestDataManifestHash` | string? | SHA256 of latest data manifest |
| `latestSyncAt` | number? | Timestamp of last sync commit |
| `artifacts` | string? | Legacy field (R2 artifact prefix) |
| `dataId` | string? | Legacy field (data blob ID) |

## Lifecycle

### Creation

- Triggered by: `tahuna init` only
- Creates one environment record on the backend
- Links to local project via `.tahuna/environment_id`
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

- Runtime spec updates are validated against the GPU catalog:
  - `gpu_type` must exist in available GPUs
  - `gpu_count` must not exceed max for that GPU type
  - `volume_gb` must be positive
- Manifest pointers (`latestCodeManifestHash`, `latestDataManifestHash`) are updated only by the sync commit endpoint, never by direct user commands.

### Deletion

| Command | Endpoint | Description |
|---------|----------|-------------|
| `tahuna env delete --id <id>` | `DELETE /api/environments/{id}` | Cascade delete |

**Cascade behavior:**
1. Delete all runs belonging to this environment (including run events, logs, metrics).
2. Delete all synced code/data blobs and manifests in R2 under this environment's prefix.
3. Delete the environment record.
4. CLI should also remove local `.tahuna/environment_id` if it matches.

### Pull (future)

- `tahuna pull` — list remote environments and link one to the current project directory.
- Creates `.tahuna/environment_id` pointing to existing environment.
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

## Invariants

- One project directory maps to exactly one environment.
- One environment belongs to exactly one user.
- Environment deletion cascades to all child resources (runs, blobs, manifests).
- Manifest pointers are only written by sync commit, never by user commands.
- Framework is detected from `requirements.txt` and determines pod image selection.

## Error States

| Condition | Behavior |
|-----------|----------|
| Environment not found | 404: "Environment not found." |
| Environment belongs to different user | 403: "Access denied." |
| Invalid GPU type on update | 400: "GPU type not available. See `tahuna catalog`." |
| GPU count exceeds max | 400: "Max GPU count for <type> is <N>." |
| Delete with active runs | Runs in terminal states are deleted. Active runs are cancelled first, then deleted. |

## Dependencies

- Auth (user scoping)
- GPU catalog (spec validation)
- Sync system (manifest pointers)
- Runs (cascade deletion)
- R2 (blob/manifest storage)
