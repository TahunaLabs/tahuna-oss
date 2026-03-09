# Trainer Runtime

Last updated: 2026-03-09

## Current Runtime (Implemented)
Current runtime is an in-pod bootstrap runner, not yet FSDP.

Flow:
1. Pod receives env (`TAHUNA_RUN_ID`, `TAHUNA_API_BASE`, `TAHUNA_RUNTIME_TOKEN`, manifest hashes/keys).
2. Pod calls `GET /api/runs/{run_id}/runtime/bootstrap`.
3. Pod downloads code/data files using signed download URLs from the bootstrap plan.
4. Pod verifies each blob hash and size before writing to disk.
5. Pod runs `python3 -u /workspace/train.py`.
6. Pod sends:
   - `runtime/logs`
   - `runtime/metrics`
   - `runtime/status`

If no `train.py` exists, runtime reports completion after workspace materialization.

## Current Metric Extraction
- Parses `name=value` pairs from training stdout and emits them as runtime metrics.

## Runtime Auth
- Runtime endpoints use a per-run bearer token.
- Backend stores only `runtimeTokenHash` and validates hashed bearer tokens.

## Not Implemented Yet
- FSDP wrapping and `torchrun` process groups.
- Distributed data sharding by global rank.
- Checkpoint commit/resume with `torch.distributed.checkpoint`.

## Next Runtime Milestone
- Replace bootstrap `train.py` execution with a trainer package that supports:
  - multi-GPU launch
  - FSDP
  - shard-aware dataloaders
  - durable checkpoint/resume
