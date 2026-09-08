# R2 Storage Structure and IO Flows (Current)

Audit date: 2026-04-01

This document describes how Tahuna currently structures Cloudflare R2 object keys and how storage read/write paths work after the storage index refactor.

## Scope

- Source of truth is current implementation in `web/convex/*` and runtime callback contracts.
- "Raw data" in this doc means direct uploads plus sync-managed manifests/blobs.
- "Artifacts" means run outputs uploaded by runtime callbacks.

## Single Bucket + Indexed Metadata

Tahuna uses one R2 bucket via `@convex-dev/r2`. Separation remains prefix-based in object keys.

Tahuna now uses a canonical Convex index table (`storageObjects`) for storage listing and ownership scoping:

- `source`: `data | run_artifact`
- `objectKind`: `data_upload | data_manifest | run_artifact`
- `key`, `name`, `size`, `createdAt`, optional `runId`, optional `dataBlobId`, optional `dataId`

`storageObjects` is authoritative for storage list surfaces; R2 is authoritative for object bytes.

## Canonical R2 Key Patterns

| Object class | Canonical key pattern | Primary writers | Primary readers |
|---|---|---|---|
| Sync blobs (dedup) | `blobs/<sha256>` | CLI sync (`/api/sync/blobs/upload-url`) | Runtime bootstrap materialization |
| Code manifests | `environments/<environmentId>/manifests/code/<manifestHash>.json` | CLI sync (`/api/sync/manifests/upload-url`) | Runtime bootstrap planner |
| Data manifests | `data/<dataId>/manifests/<manifestHash>.json` | CLI sync (`/api/sync/manifests/upload-url`) + sync commit index upsert | Runtime bootstrap planner, storage data surface |
| Serve model snapshot objects | `serves/<environmentId>/<timestamp>-<suffix>/model/<relativePath>` | Serve creation snapshot copy | Serve runtime bootstrap planner |
| Serve model snapshot manifests | `serves/<environmentId>/<timestamp>-<suffix>/model-manifest.json` | Serve creation snapshot copy | Serve runtime bootstrap planner |
| Direct uploaded data file | `data/<blobId>__<urlEncodedFilename>` | Dashboard data upload (`api.data.generateUploadUrl`) | Dashboard data list, CLI `/api/data`, storage data surface |
| Run artifact | `runs/<environmentId>/<runCreatedAtMs>/output/<sanitizedName>` | Runtime callback (`/api/runs/{runId}/runtime/artifacts/upload-url`) | Storage artifact surface, run detail |

### Legacy field

- `environments.artifacts` still exists and is populated (`environments/<environmentId>`), but runtime artifacts are written under `runs/<environmentId>/<timestamp>/output/...`.

## Write Flows

### 1) Direct data upload (dashboard)

1. Client requests `api.data.generateUploadUrl(filename, size_bytes)`.
2. Backend allocates `blobId` and key:
   - `data/<blobId>__<urlEncodedFilename>`
3. Client uploads to signed R2 URL.
4. `onUpload` validates key shape and max size (`UPLOAD_LIMITS_BYTES.dataBlob`).
5. `onUpload` upserts `storageObjects` row (`source=data`, `objectKind=data_upload`).
6. Dashboard calls `api.data.syncMetadata({ key })` after PUT.

### 2) CLI sync (code + data)

1. CLI computes hashes, calls `/api/sync/blobs/missing`.
2. Missing blobs uploaded to:
   - `blobs/<sha256>`
3. CLI uploads manifests via `/api/sync/manifests/upload-url`.
4. CLI finalizes with `/api/sync/commit` (`code_manifest_hash` / `data_manifest_hash`).
5. Environment sync pointers are updated.
6. If `data_manifest_hash` is committed, backend upserts `storageObjects` row for:
   - `data/<dataId>/manifests/<manifestHash>.json`

### 3) Runtime artifact upload

1. Runtime requests upload URLs:
   - `POST /api/runs/{runId}/runtime/artifacts/upload-url`
2. Backend uses run output prefix `runs/<envId>/<timestamp>/output`.
3. Runtime uploads artifacts to signed R2 URLs.
4. Runtime commits keys:
   - `POST /api/runs/{runId}/runtime/artifacts/commit`
5. Backend commit logic:
   - accepts only keys under run output prefix
   - verifies object existence (metadata or HEAD fallback)
   - deduplicates and appends to `run.artifactKeys`
   - upserts `storageObjects` rows (`source=run_artifact`, `objectKind=run_artifact`)

### 4) Artifact rename (dashboard storage)

1. `api.storage.renameArtifact` prepares/validates ownership and conflicts.
2. Backend copies R2 object (`CopyObject`) from old key to new sibling key.
3. Finalize step updates:
   - `run.artifactKeys` old->new
   - matching `storageObjects` row old key->new key
4. Old object delete is best-effort (`cleanup_warning` on failure).

## Read Flows

### 1) Run runtime bootstrap

1. Runtime requests:
   - `GET /api/runs/{runId}/runtime/bootstrap`
2. Backend loads pinned manifest hashes/keys from run payload.
3. Code/data manifests are fetched from R2 and hash-verified.
4. Blob keys (`blobs/<sha256>`) are resolved to signed download URLs.
5. Runtime materializes workspace/data from explicit entries.

### 2) Serve runtime bootstrap

1. Runtime requests:
   - `GET /api/serves/{serveId}/runtime/bootstrap`
2. Backend loads pinned code/data manifest hashes plus pinned serve model snapshot metadata from the serve row.
3. Code/data sync manifests are fetched from R2 and hash-verified.
4. The serve snapshot manifest is fetched from the serve-owned `model-manifest.json` key and hash-verified.
5. Blob keys (`blobs/<sha256>`) are resolved to signed download URLs for code/data entries.
6. Serve snapshot object keys under `serves/<environmentId>/.../model/` are resolved to signed download URLs for model entries.
7. Runtime materializes workspace/data/model from explicit entries.

### 3) Storage list (`api.storage.list`)

Storage list is now index-backed:

1. Query `storageObjects` for user (optionally filtered by `source`).
2. Apply search + sort + pagination in Convex.
3. Hydrate visible page rows with R2 metadata/URLs (`getMetadata`/`getUrl`).

Important:

- `storageObjects` is the canonical list surface.
- No R2-wide scan/merge of environment/run tables during list.

### 4) CLI `/api/data` read path

`/api/data` and `/api/data/{id}` use `internal.data.internalList`, which reads indexed `data_upload` rows from `storageObjects` and resolves download URLs from R2.

It does not list dedup blobs directly.

## Cleanup and Deletion

### Run delete

Run delete:

- removes indexed artifact rows for that run keys from `storageObjects`
- removes run DB rows/events/logs/metrics
- does not perform full R2 prefix garbage collection by itself

### Environment delete

Environment delete:

- deletes collected run artifact objects (best-effort)
- deletes indexed keys for run artifacts and manifest refs
- deletes indexed rows by run/data prefixes for the removed environment
- schedules dedup cleanup action (`internalCleanupDedupBlobs`) which:
  - removes unreferenced dedup blobs
  - deletes environment/data/run prefixes in R2 (best-effort bounded loop)

## Operational Caveats

- If an indexed key is missing in R2, list hydration drops that item from the returned page.
- Cleanup helpers remain best-effort for very large key volumes.

## CLI/API Commands (List and Delete)

### CLI listing

- `tahuna data list`
- `tahuna data show <data_id>`
- `tahuna run list`
- `tahuna run show <run_id|run_name>`

### CLI delete

- `tahuna run rm <run_id|run_name|pattern>... [--all|-a] [--cancel|-c] [--force|-f]`
- `tahuna env rm <env_id> | --id <env_id> | --all|-a`

Notes:

- There is no dedicated `tahuna data rm` command currently.
- There is no dedicated CLI artifact delete command currently; artifact removal is tied to run/environment lifecycle.

### HTTP endpoints used by CLI/runtime

- `GET /api/data`
- `GET /api/data/{data_id}`
- `GET /api/runs`
- `DELETE /api/runs/{run_id}`
- `DELETE /api/environments/{environment_id}`
- `POST /api/runs/{runId}/runtime/artifacts/upload-url`
- `POST /api/runs/{runId}/runtime/artifacts/commit`

## Terminology Mapping

- "Raw data":
  - direct uploads: `data/<blobId>__<filename>`
  - data manifests: `data/<dataId>/manifests/<hash>.json`
  - dedup blobs: `blobs/<sha256>`
- "Artifacts":
  - run outputs: `runs/<environmentId>/<runCreatedAtMs>/output/...`

## Implementation References

- Data upload/list and data index upsert: `web/convex/data.ts`
- Sync key construction/routes: `web/convex/cli/shared.ts`, `web/convex/cli/sync.ts`
- Runtime bootstrap + artifact commit/indexing: `web/convex/runs.ts`, `web/convex/cli/runs.ts`
- Storage index-backed list + artifact rename: `web/convex/storage.ts`
- Environment cleanup + manifest index upsert: `web/convex/environments.ts`
- Storage index schema: `web/convex/schema.ts`
