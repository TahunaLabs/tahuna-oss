# Incremental Sync (0.1.0) Spec (Incremental, R2-backed)

Status: Draft ready for implementation
Date: 2026-03-09
Owner: Tahuna CLI + Convex backend

## 1) Scope

Build Incremental Sync (0.1.0) with these constraints:
- Run preflight sync remains mandatory on `tahuna train` and `tahuna run create`.
- Manual sync command is added (`tahuna sync`, with `code` and `data` modes).
- Upload model is incremental (hash/manifest), not full tarball on each sync.
- R2 remains source of truth. Pods fetch pinned manifests from R2 at run startup.

Out of scope for this milestone:
- Git packfile compatibility.
- Binary delta compression.
- Full env var sync/injection.
- Live metrics streaming.

## 2) Terminology

- Blob: content-addressed file object keyed by sha256.
- Manifest: JSON document describing a snapshot (file path -> blob hash + metadata).
- Sync version: hash of manifest JSON (`manifest_hash`).

## 3) Data Model Changes

Add fields in Convex schema:

### environments
- `dataId?: string`
- `latestCodeManifestHash?: string`
- `latestDataManifestHash?: string`
- `latestSyncAt?: number`

### runs
- `dataId?: string`
- `codeManifestHash?: string`
- `dataManifestHash?: string`

Reason:
- Environment keeps latest synced state.
- Run pins exact manifests for reproducibility.

## 4) R2 Object Layout

Use deterministic keys:
- Code blobs: `<userId>/environment/<environmentId>/blobs/code/<sha256>`
- Data blobs: `<userId>/data/<dataId>/blobs/<sha256>`
- Code manifests: `<userId>/environment/<environmentId>/manifests/code/<manifestHash>.json`
- Data manifests: `<userId>/data/<dataId>/manifests/<manifestHash>.json`

Optional (future): keep refs/aliases per environment (`latest`).

## 5) Manifest Shape

```json
{
  "version": 1,
  "type": "code",
  "created_at": 1730000000000,
  "entries": [
    {
      "path": "train.py",
      "sha256": "...",
      "size": 1234,
      "mode": 420
    }
  ]
}
```

Rules:
- `entries` sorted by `path` for stable hashing.
- Manifest hash is sha256 over canonical JSON bytes.
- Separate manifests for code and data.

## 6) Backend API Contract (new/updated)

Keep existing auth model (Bearer API key).

### 6.1 Check missing blobs
`POST /api/sync/blobs/missing`

Request:
```json
{
  "environment_id": "envId",
  "kind": "code",
  "hashes": ["sha256a", "sha256b"]
}
```

Response:
```json
{
  "missing": ["sha256b"]
}
```

### 6.2 Blob upload URL
`POST /api/sync/blobs/upload-url`

Request:
```json
{
  "environment_id": "envId",
  "kind": "code",
  "sha256": "sha256b"
}
```

Response:
```json
{
  "key": "<r2-key>",
  "url": "<signed-put-url>"
}
```

### 6.3 Manifest upload URL
`POST /api/sync/manifests/upload-url`

Request:
```json
{
  "environment_id": "envId",
  "kind": "code",
  "manifest_hash": "mh123"
}
```

Response:
```json
{
  "key": "<r2-key>",
  "url": "<signed-put-url>"
}
```

### 6.4 Commit sync pointer
`POST /api/sync/commit`

Request:
```json
{
  "environment_id": "envId",
  "code_manifest_hash": "mh-code",
  "data_manifest_hash": "mh-data",
  "code_manifest": { "...": "manifest payload" },
  "data_manifest": { "...": "manifest payload" }
}
```

Response:
```json
{
  "ok": true,
  "environment_id": "envId",
  "code_manifest_hash": "mh-code",
  "data_manifest_hash": "mh-data"
}
```

Behavior:
- Validate manifest objects exist in R2 before committing.
- Validate manifest payload schema and hash equivalence before committing.
- Patch environment latest pointers.

### 6.5 Run creation behavior
- Existing `POST /api/environments/{env_id}/runs` remains.
- Backend resolves and pins current environment manifest pointers into run record.
- If environment sync pointers are missing, run creation returns a clear error instructing the user to run `tahuna sync`.
- Optional future override: accept explicit manifest hashes for advanced users.

## 7) CLI Behavior

## 7.1 New commands
- `tahuna sync`
- `tahuna sync code`
- `tahuna sync data`

Defaults:
- `tahuna sync` syncs both code and data.
- Uses linked environment id from `.tahuna/environment_id`.

## 7.2 Preflight sync on run
- `train` and `run create` call same sync engine.
- If local state differs from remote pointer, sync incrementally then continue.

## 7.3 Local cache/state
Store under `.tahuna/`:
- `sync_code_manifest.json`
- `sync_data_manifest.json`

Used for fast diffing without re-fetching old manifests each time.

## 8) Pod Consumption Contract

Pod launch input must include:
- `code_manifest_hash`
- `data_manifest_hash`

Example provisioning payload (simulated today, shape is contract for real pod launcher):
```json
{
  "run_id": "run_123",
  "environment_id": "env_123",
  "user_id": "user_123",
  "input_path": "runs/env_123/1730000000000/input",
  "output_path": "runs/env_123/1730000000000/output",
  "logs_path": "runs/env_123/1730000000000/logs",
  "code_manifest_hash": "mh-code",
  "data_manifest_hash": "mh-data",
  "code_manifest_key": "user_123/environment/env_123/manifests/code/mh-code.json",
  "data_manifest_key": "user_123/data/data_abc/manifests/mh-data.json",
  "contract_version": "sync-incremental-0.1.0"
}
```

Pod startup flow:
1. Download manifest JSONs from R2.
2. Download referenced blobs by hash.
3. Materialize working tree and data dir.
4. Start training entrypoint.

If manifest fetch fails, mark run failed with actionable error.

## 9) Error Handling + Retry

CLI:
- Blob upload retries with exponential backoff (e.g., 3 attempts).
- Resume behavior: skip already-existing blobs using `missing` endpoint.

Backend:
- Reject malformed hashes/manifests.
- Enforce key prefix ownership by `userId` and verify `environment_id` ownership.

## 10) Acceptance Criteria

- `sync` uploads only changed blobs between two runs.
- Re-running sync with no file changes performs zero blob uploads.
- `train`/`run create` always produce runs with pinned manifest hashes.
- Pod-side contract can reconstruct workspace from pinned manifests only.
- Existing auth and environment ownership checks remain intact.

## 11) Rollout Plan

1. Backend endpoints + schema changes.
2. CLI manifest engine + sync command.
3. Wire run creation pinning.
4. Pod fetch integration.
5. Remove legacy code tar preflight path once incremental sync is stable.
