# Object Storage (S3/R2)

Last updated: 2026-03-09

## Role
Object storage is the durable source of truth for synced code/data blobs and manifests.

## Current Key Conventions
Code domain:
- Blobs: `{userId}/environment/{environmentId}/blobs/code/{sha256}`
- Manifests: `{userId}/environment/{environmentId}/manifests/code/{manifestHash}.json`

Data domain:
- Blobs: `{userId}/data/{dataId}/blobs/{sha256}`
- Manifests: `{userId}/data/{dataId}/manifests/{manifestHash}.json`

Legacy/direct upload helpers still exist for:
- code archive artifacts
- data file uploads

## Current Sync Contract
1. CLI computes deterministic manifests for `code` and `data`.
2. CLI asks server which blob hashes are missing.
3. CLI uploads only missing blobs.
4. CLI uploads manifest objects.
5. CLI calls `/api/sync/commit`.
6. Control plane stores latest manifest pointers on environment.

## Current Integrity Guarantees
- Blob addresses are content hashes.
- Manifest payload hash must match `manifest_hash` on commit.
- Provisioning/runtime consume pinned manifest hashes from run record.
- Runtime re-validates blob hash/size before writing locally.

## Not Implemented Yet
- Formal checkpoint object layout and commit protocol.
- Lifecycle/retention policies for checkpoints and runtime artifacts.
