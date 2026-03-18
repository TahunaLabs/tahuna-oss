# R2 Storage Structure and IO Flows (Current)

Audit date: 2026-03-18

This document describes how Tahuna currently structures Cloudflare R2 object keys and how data/artifacts are written and read.

## Scope

- Source of truth is current implementation in `web/convex/*` and runtime callback contracts.
- "Raw data" in this doc means user/project input data (direct uploads plus sync-managed data manifests/blobs).
- "Artifacts" means run outputs uploaded by runtime callbacks.

## Single Bucket, Prefix-Based Separation

Tahuna currently uses one R2 bucket via `@convex-dev/r2`. Separation is logical (prefix-based), not per-bucket.

| Object class | Canonical key pattern | Primary writers | Primary readers |
|---|---|---|---|
| Sync blobs (dedup) | `<userId>/blobs/<sha256>` | CLI sync (`/api/sync/blobs/upload-url`) | Runtime bootstrap materialization |
| Code manifests | `<userId>/environment/<environmentId>/manifests/code/<manifestHash>.json` | CLI sync (`/api/sync/manifests/upload-url`) | Runtime bootstrap planner |
| Data manifests | `<userId>/data/<dataId>/manifests/<manifestHash>.json` | CLI sync (`/api/sync/manifests/upload-url`) | Runtime bootstrap planner, dashboard Storage data surface |
| Direct uploaded data file | `<userId>/data/<blobId>__<urlEncodedFilename>` | Dashboard data upload (`api.data.generateUploadUrl`) | Dashboard data list, CLI `/api/data`, dashboard Storage data surface |
| Run artifact | `runs/<environmentId>/<runCreatedAtMs>/output/<sanitizedName>` | Runtime callback (`/api/runs/{runId}/runtime/artifacts/upload-url`) | Dashboard Storage artifact surface, run detail |

### Legacy/compat fields

- `environments.artifacts` exists in schema and is set to `<userId>/environment/<environmentId>`, but runtime output artifacts are written under `runs/<environmentId>/<timestamp>/output/...`.
- Treat `environments.artifacts` as a legacy environment prefix marker, not the canonical runtime artifact key root.

## Write Flows

### 1) Direct data upload (dashboard)

1. Client requests `api.data.generateUploadUrl(filename, size_bytes)`.
2. Backend allocates `blobId` and writes key:
   - `<userId>/data/<blobId>__<urlEncodedFilename>`
3. Client uploads directly to signed R2 URL.
4. `onUpload` validates:
   - key starts with `<userId>/data/`
   - object size <= `UPLOAD_LIMITS_BYTES.dataBlob`
5. Dashboard UI then calls `api.data.syncMetadata({ key })` after each successful PUT so new objects appear in metadata-backed lists faster.

Notes:
- This is file-style upload, not manifest/dedup sync.

### 2) CLI sync (code + project data/raw data)

1. CLI computes file hashes and asks `/api/sync/blobs/missing`.
2. Missing hashes get upload URLs from `/api/sync/blobs/upload-url`.
3. Blob objects are uploaded to:
   - `<userId>/blobs/<sha256>`
4. CLI builds and uploads manifests through `/api/sync/manifests/upload-url`:
   - code manifest key: `<userId>/environment/<environmentId>/manifests/code/<manifestHash>.json`
   - data manifest key: `<userId>/data/<dataId>/manifests/<manifestHash>.json`
5. CLI finalizes with `/api/sync/commit` (hash-based), which updates environment sync pointers (`latestCodeManifestHash`, `latestDataManifestHash`).

Notes:
- Data manifests and blobs are the canonical project data snapshot model used by runtime bootstrap.

### 3) Runtime artifact upload

1. Runtime posts artifact candidates to:
   - `POST /api/runs/{runId}/runtime/artifacts/upload-url`
2. Backend reads run output prefix (`runs/<envId>/<timestamp>/output`) from the run row.
3. Each artifact name is sanitized (`\` -> `/`, strip leading slash, replace `..` with `_`) and mapped to:
   - `<outputPath>/<safeName>`
4. Runtime uploads files to signed R2 URLs.
5. Runtime commits keys via:
   - `POST /api/runs/{runId}/runtime/artifacts/commit`
6. Backend appends committed keys to `run.artifactKeys` (deduplicated by key).

### 4) Artifact rename (dashboard Storage)

1. `api.storage.renameArtifact` validates ownership and conflicts.
2. Backend performs R2 copy from old key to new sibling key.
3. Run record `artifactKeys` is patched (old -> new).
4. Old object is deleted best-effort.

## Read Flows

### 1) Runtime bootstrap read path

1. Runtime requests `GET /api/runs/{runId}/runtime/bootstrap`.
2. Backend loads pinned manifest hashes + keys from run payload.
3. Code/data manifest JSON is fetched from R2 and hash-verified.
4. Manifest entries are resolved to blob keys (`<userId>/blobs/<sha256>`), then signed download URLs are generated.
5. Runtime receives explicit entry list with path/mode/size/hash/url and materializes workspace/data.

### 2) Dashboard Storage read path (`api.storage.list`)

Storage data source currently merges:

- Direct upload data rows from `internal.data.internalList`:
  - keys shaped as `<userId>/data/<blobId>__<filename>`
- Environment-referenced data manifests:
  - derived from `latest_data_manifest_hash` and `bound_data_manifest_hashes`
  - keys shaped as `<userId>/data/<dataId>/manifests/<hash>.json`
  - metadata lookup first; falls back to signed URL lookup
- Run artifact rows from `run.artifactKeys`

Then `storage.list` applies:
- source filter (`all`, `data`, `run_artifact`)
- search
- sort
- pagination

Important scope note:
- The data-manifest branch is environment-reference based; it includes manifests pointed to by environment fields (`latest_data_manifest_hash`, `bound_data_manifest_hashes`), not every manifest object that may exist in R2.

### 3) CLI `/api/data` read path

`/api/data` and `/api/data/{id}` currently use `internal.data.internalList`, which only includes top-level direct upload keys shaped as:
- `<userId>/data/<blobId>__<filename>`

It does not enumerate sync data manifests or dedup blobs directly.

## Cleanup and Deletion Behavior

### Environment delete

Environment delete performs storage cleanup by:

- deleting collected run artifact keys
- deleting unreferenced dedup blobs `<userId>/blobs/<sha256>` (manifest-reference aware)
- deleting environment prefix `<userId>/environment/<environmentId>/...`
- deleting data prefix `<userId>/data/<dataId>/...` when no longer referenced
- deleting `runs/<environmentId>/...` prefix

Timing note:
- Part of dedup/blob/prefix cleanup runs through a scheduled internal action (`internalCleanupDedupBlobs`) after the environment delete mutation queues it.

### Run delete

Run delete removes run/telemetry rows and handles pod termination, but does not independently perform full R2 artifact-prefix garbage collection. Environment deletion remains the broad cleanup path.

## Current Operational Caveats

- Metadata indexing is not strictly immediate; some list paths rely on metadata and may lag object writes.
- Data listing uses scan windows in `internal.data.internalList` (`MAX_LIST_SCAN_PAGES`, bounded page size), so very large buckets can return `scan_capped`.
- Artifact listing is capped by `MAX_ARTIFACTS_SCANNED` in `storage.list`.
- Prefix cleanup helper (`deleteObjectsByPrefix`) is bounded (100 pages x 100 keys); cleanup is best-effort and may require follow-up passes in extreme key volumes.

## Terminology Mapping (Current)

- "Raw data" (user wording) maps to:
  - direct uploaded data files (`<userId>/data/<blobId>__<filename>`)
  - sync-managed data manifests (`<userId>/data/<dataId>/manifests/<hash>.json`)
  - dedup blobs (`<userId>/blobs/<sha256>`) referenced by manifests
- "Artifacts" maps to run output objects under:
  - `runs/<environmentId>/<runCreatedAtMs>/output/...`

## Implementation References

- Data upload/list: `web/convex/data.ts`
- Sync key construction + upload URL routes: `web/convex/cli/shared.ts`, `web/convex/cli/sync.ts`
- Runtime manifest/bootstrap read + run output path creation: `web/convex/runs.ts`
- Runtime artifact upload/commit HTTP route: `web/convex/cli/runs.ts`
- Storage aggregation/listing/rename: `web/convex/storage.ts`
- Environment delete cleanup and prefix deletion: `web/convex/environments.ts`
