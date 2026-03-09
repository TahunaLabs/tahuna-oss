# Ephemeral Node Disk

## Purpose
Ephemeral node disk exists to reduce GPU idle time by caching hot data near compute. It is a performance layer only.

## Invariants
- Never treat ephemeral disk as source of truth.
- Everything required for recovery must exist in object storage.
- Cache can be wiped at any time without correctness loss.

## Disk Layout
```text
/local/tahuna/cache/{dataset_snapshot_id}/shards/...
/local/tahuna/checkpoints/{run_id}/{attempt_id}/tmp/...
/local/tahuna/checkpoints/{run_id}/{attempt_id}/staged/...
/local/tahuna/tmp/...
```

## Cache Behavior
- Read-through cache:
  - On shard miss, download from S3/R2 and store locally.
  - On hit, read local.
- Use lock files to prevent duplicate shard downloads by local ranks.
- Keep LRU eviction with hard size cap (for example 60-80% of available disk).

## Prefetch Strategy
- Prefetch next K shards ahead of current shard.
- Prefetch depth is configurable per workload.
- Allow training to continue while next shards download asynchronously.

## Checkpoint Staging
- Write checkpoint locally first.
- Upload in background thread/process.
- Delete staged local checkpoint after successful commit unless local retention is explicitly enabled.

## Failure and Cleanup
- On startup:
  - clean stale temp files
  - keep valid cache entries
- On shutdown:
  - flush in-flight upload state
  - best effort cleanup

## Tuning Knobs
- `CACHE_MAX_GB`
- `PREFETCH_SHARDS`
- `CHECKPOINT_LOCAL_KEEP`
- `MAX_PARALLEL_DOWNLOADS`
