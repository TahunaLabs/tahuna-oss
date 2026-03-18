# Spec: Sync (Code & Data)

## Scope

Content-addressed incremental sync of project code and data from local machine to R2 object storage. Sync produces versioned manifests that are pinned on runs for reproducibility. Pod-produced outputs are synced separately to Storage and are last-write snapshots (not manifest-versioned).

## Elements

| Element | Type | Description |
|---------|------|-------------|
| Blob | R2 object | Content-addressed file, keyed by SHA256 hash |
| Manifest | R2 JSON object | Ordered list of file entries (path, hash, mode, size) |
| Manifest hash | String | SHA256 of the manifest JSON content |
| Manifest pointer | Environment field | `latestCodeManifestHash` / `latestDataManifestHash` |
| Sync cache | Local file | `.tahuna/sync_code_manifest.json`, `.tahuna/sync_data_manifest.json` |

### Manifest Schema

```json
{
  "version": 1,
  "type": "code" | "data",
  "created_at": "2026-03-10T12:00:00Z",
  "entries": [
    {
      "path": "train.py",
      "sha256": "abc123...",
      "mode": 33188,
      "size": 4096
    }
  ]
}
```

- `entries` must be sorted by `path` (deterministic ordering).
- `sha256` is the hex-encoded SHA256 of the file content.
- `mode` is the Unix file permission integer.

### R2 Key Patterns

| Object | Key pattern |
|--------|-------------|
| Code blob | `blobs/<sha256>` |
| Data blob | `blobs/<sha256>` |
| Code manifest | `environments/<envId>/manifests/code/<manifestHash>.json` |
| Data manifest | `data/<dataId>/manifests/<dataManifestHash>.json` |

## Lifecycle

### Sync Triggers

| Trigger | Scope | Description |
|---------|-------|-------------|
| `tahuna sync` | code + data | Manual full sync |
| `tahuna sync code` | code only | Manual code-only sync |
| `tahuna sync data` | data only | Manual data-only sync |
| `tahuna train` | code + data | Automatic preflight sync before run creation |
| `tahuna run create` | code + data | Automatic preflight sync before run creation |

### Incremental Sync Algorithm

```
syncIncremental(environmentID, scope):

  FOR EACH kind IN scope (code, data):

    1. COLLECT ENTRIES
       Code: walk project directory
         - Respect .gitignore (if present)
         - Always exclude: .tahuna/, .git/, node_modules/, __pycache__/
         - Exclude configured data directory from code entries
         - Skip symlinks
       Data: walk configured data directory
         - Bundle into tar.gz archive (__tahuna__/data_bundle.tar.gz)
         - Archive is the single blob for data sync

    2. BUILD MANIFEST
       - Compute SHA256 for each file
       - Sort entries by path
       - Serialize to JSON
       - Compute manifest hash (SHA256 of JSON content)

    3. CHECK CACHE (zero-change detection)
       - Compare manifest hash against .tahuna/sync_{kind}_manifest.json
       - If identical: skip blob upload, still commit to refresh pointer timestamp
       - If different: proceed with blob upload

    4. FIND MISSING BLOBS
       - Chunk all entry hashes into batches from shared config (`SYNC_MISSING_BATCH_SIZE`)
       - POST /api/sync/blobs/missing with hash list
       - Backend returns subset of hashes not yet in R2

    5. UPLOAD MISSING BLOBS
       - For each missing hash:
         a. POST /api/sync/blobs/upload-url -> signed R2 PUT URL
         b. PUT file content to signed URL
       - Parallel upload workers come from shared config (`SYNC_UPLOAD_WORKERS`)

    6. UPLOAD MANIFEST
       - POST /api/sync/manifests/upload-url -> signed R2 PUT URL
       - PUT manifest JSON to signed URL

    7. COMMIT
       - POST /api/sync/commit with:
         {
           environment_id: "...",
           code_manifest_hash: "..." (if code synced),
           data_manifest_hash: "..." (if data synced)
         }
       - Backend validates:
         a. Manifest exists in R2 (with metadata sync + bounded polling for propagation)
         b. Manifest JSON schema is valid
         c. Updates environment latestCodeManifestHash / latestDataManifestHash
       - Retry logic: bounded attempts and exponential backoff from shared config
         for transient "manifest not found" errors (R2 propagation delay)

    8. UPDATE LOCAL CACHE
       - Write manifest hash to .tahuna/sync_{kind}_manifest.json
```

### File Exclusion Rules

```
Code sync excludes:
  - .tahuna/           (always)
  - .git/              (always)
  - node_modules/      (always)
  - __pycache__/       (always)
  - configured data directory (from project.yaml)
  - configured output directory (from project.yaml)
  - patterns from .gitignore (if file exists)

Data sync includes:
  - only the configured data directory

Output sync rules:
  - configured output directory is always excluded from local -> remote sync
  - output artifacts are synced only from pod -> Storage/R2
  - output artifact view keeps latest snapshot state (not rollback/version history)
```

### Sync Versioning (future: rollback support)

- Every committed manifest is a version. Old manifests are preserved in R2.
- Future commands:
  - `tahuna sync history [code|data]` — list past manifest hashes with timestamps
  - `tahuna sync rollback <manifest-hash>` — set environment pointer to a previous manifest
- Runs always pin the manifest hash at creation time, so historical runs always reference their exact version regardless of later syncs.
- This versioning model applies to code/data manifests only, not output artifact snapshots.

### Output Artifact Sync Semantics

- Selected output directory contents are uploaded by pod runtime callbacks.
- Output artifact keys are stored on the run record and surfaced in Storage.
- Re-uploads overwrite latest visible artifact state for that run path; historical output snapshots are not retained in v1.
- If historical output versioning is required later, it should be introduced as a separate artifact version index.

### Chunked Upload (future: large files)

- Files exceeding a size threshold (TBD, e.g., 100MB) use multipart/resumable upload.
- Each chunk is verified independently.
- Upload can be resumed after network interruption.
- Applies to both code and data blobs.

## Backend Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/blobs/missing` | POST | Given hash list, return hashes not in R2 |
| `/api/sync/blobs/upload-url` | POST | Generate signed PUT URL for a blob |
| `/api/sync/manifests/upload-url` | POST | Generate signed PUT URL for a manifest |
| `/api/sync/commit` | POST | Validate manifest, update environment pointers |

## Invariants

- Blobs are immutable. A given SHA256 hash always maps to the same content.
- Blobs are shared across environments (content-addressed deduplication).
- Manifests are immutable once committed. Rollback changes the pointer, not the manifest.
- Sync commit is atomic: either both pointers update or neither does (when syncing both scopes).
- The sync cache (`.tahuna/sync_*_manifest.json`) is advisory. Deleting it forces a full re-check but not a full re-upload (missing-blob check handles dedup).
- Manual sync (`tahuna sync`) is a convenience command. `train` and `run create` always auto-sync.
- Local output directories are excluded from local sync and cannot override pod-synced output artifacts.

## Shared Defaults & Constants

- Upload worker count, retry budgets, and commit polling/backoff values are defined in `web/config.ts`.
- CLI output and error messages should render configured values instead of hardcoding counts.

## Error States

| Condition | Behavior |
|-----------|----------|
| No files to sync | Warning: "No files found for <scope> sync." Commit still runs (empty manifest). |
| Blob upload fails | Retry up to configured max attempts per blob. If still failing: error with failed file list. |
| Manifest not found on commit | Retry with re-upload up to configured max attempts. |
| Network timeout during upload | Error: "Upload timed out. Check your connection and run `tahuna sync` again." |
| Environment not synced (on run create) | Error: "Environment has no synced code. Run `tahuna sync` first." |

## Dependencies

- Auth (API key for signed URLs)
- Environments (manifest pointers stored on environment)
- R2 (blob and manifest storage)
- .gitignore parser (for exclusion rules)
