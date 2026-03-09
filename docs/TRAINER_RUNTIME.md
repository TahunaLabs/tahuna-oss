# Trainer Runtime

## Purpose
The trainer runtime owns all ML execution logic that must stay provider-independent:
- FSDP distributed training.
- Data sharding and loading.
- Checkpointing and resume.
- Metrics and progress emission.

## Bootstrap Sequence
1. Read `RunSpec` env.
2. Initialize distributed process group (`torchrun` + NCCL).
3. Build model and wrap with FSDP.
4. Load dataset manifest and initialize rank-specific shard iterator.
5. Attempt resume from latest committed checkpoint.
6. Enter train loop with periodic checkpoint + metrics emit.

## Distributed Training Contract
- Launch: `torchrun` with fixed world size from `RunSpec`.
- Required env:
  - `RANK`, `LOCAL_RANK`, `WORLD_SIZE`
  - `MASTER_ADDR`, `MASTER_PORT`
- FSDP baseline:
  - mixed precision enabled
  - gradient accumulation optional
  - activation checkpointing optional

## Data Sharding
- Input is an immutable dataset manifest (list of shards + checksums + sample counts).
- Per-epoch rank assignment:
  - Shuffle shard order with deterministic seed (`base_seed + epoch`).
  - Assign by modulo: `shard_index % world_size == rank`.
- Keep many shards relative to world size to avoid imbalance.

## Checkpoint/Resume
- Use sharded checkpointing (`torch.distributed.checkpoint`).
- Save states:
  - model
  - optimizer
  - scheduler
  - scaler
  - RNG states
  - `global_step` and `epoch`
- Resume only from a `committed` checkpoint.

## Metrics and Events
- Emit heartbeat every 10-30 seconds.
- Emit step-level metrics at configured interval.
- Emit checkpoint events:
  - `pending` on write start
  - `committed` after upload completion

## Failure Semantics
- Any worker fatal error fails the current attempt.
- Retry policy is controlled by control plane.
- On termination signal:
  - finalize in-flight checkpoint if possible
  - flush final status/log event

## Non-Goals
- No provider API calls in trainer runtime.
- No control-plane queue semantics in trainer runtime.
