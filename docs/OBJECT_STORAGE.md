# Object Storage (S3/R2)

## Purpose
Object storage is the durable source of truth for:
- Dataset snapshots and manifests.
- Checkpoints.
- Logs and metrics artifacts.
- Model outputs.

## Principles
- Immutable dataset snapshots.
- Versioned checkpoint directories.
- Control plane stores metadata index, not large blobs.
- Node-local disk is a disposable cache, never authoritative.

## Suggested Layout
```text
{bucket}/datasets/{dataset_id}/snapshots/{snapshot_id}/manifest.json
{bucket}/datasets/{dataset_id}/snapshots/{snapshot_id}/shards/{shard_id}.tar

{bucket}/runs/{run_id}/attempts/{attempt_id}/checkpoints/step_{global_step}/...
{bucket}/runs/{run_id}/attempts/{attempt_id}/logs/{timestamp}.jsonl
{bucket}/runs/{run_id}/artifacts/{kind}/{name}
{bucket}/runs/{run_id}/metrics/metrics.jsonl
```

## Dataset Contract
- `manifest.json` includes:
  - shard URI
  - byte size
  - checksum
  - sample count
  - optional class/statistics metadata
- Training always references a specific snapshot ID.

## Checkpoint Commit Protocol
1. Write checkpoint locally on ephemeral disk.
2. Upload all checkpoint objects to S3/R2.
3. Upload checkpoint manifest last.
4. Mark checkpoint `committed` in control plane.

Only committed checkpoints are valid resume points.

## Credentials Model
- Prefer short-lived scoped credentials per run/attempt.
- Alternative: presigned URLs for upload/download actions.
- Avoid long-lived static credentials in training images.

## Lifecycle Policy
- Keep dataset snapshots immutable.
- Keep latest N checkpoints per run plus explicit best checkpoint.
- Apply retention policy for logs and intermediate artifacts.
