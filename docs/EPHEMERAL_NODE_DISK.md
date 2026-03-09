# Ephemeral Node Disk

Last updated: 2026-03-09

## Current Behavior
- Runpod pod mounts writable workspace at `/workspace`.
- Bootstrap materializes code into `/workspace`.
- Bootstrap materializes data into `/workspace/data`.
- Runtime executes from local workspace.

## Guarantees
- Local files are reconstructed from pinned object-store manifests each run.
- Hash/size checks happen before materialized files are accepted.
- Local disk is treated as disposable execution state.

## Current Limitations
- No persistent local cache across runs.
- No shard prefetch queue yet.
- No explicit cache eviction policy yet.

## Recommended Next Step
- Add optional node-local read-through cache for data shards:
  - key by blob hash
  - lock to avoid duplicate concurrent downloads
  - cap by max disk usage
- Keep object storage as source of truth.
