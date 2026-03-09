# Provider Adapters

## Purpose
Provider adapters translate a provider-agnostic `RunSpec` into provider-native jobs and report lifecycle back to the control plane.

## Design Rules
- Keep adapter interface narrow and stable.
- Keep provider differences in adapters, not in trainer logic.
- Keep `RunSpec` immutable and portable across providers.

## Adapter Interface
```text
submit(run_spec) -> { provider_job_id, attempt_metadata }
status(provider_job_id) -> { status, reason, started_at, ended_at }
cancel(provider_job_id) -> { accepted: bool }
stream_logs(provider_job_id, cursor) -> { lines, next_cursor }
```

## RunSpec (Canonical)
```yaml
run_id: string
attempt_id: string
provider: lambda-k8s | runpod-slurm
image: string
entrypoint: ["python", "train.py"]
env:
  DATASET_MANIFEST_URI: string
  CHECKPOINT_BASE_URI: string
  METRICS_URI: string
  WORLD_SIZE: int
resources:
  nodes: int
  gpus_per_node: int
  cpu_per_node: int
  ram_gb_per_node: int
network:
  rendezvous_backend: c10d
  rendezvous_endpoint: string
retry:
  max_attempts: int
```

## Lambda Adapter (Kubernetes)
- Input: canonical `RunSpec`.
- Output: PyTorch distributed job spec.
- Behavior:
  - Create K8s job object with node/gpu requests.
  - Inject rendezvous env and object-storage credentials.
  - Route logs/status to control plane callbacks.
  - On cancel, delete K8s job and mark attempt cancelled.

## Runpod Adapter (Slurm)
- Input: canonical `RunSpec`.
- Output: Slurm submission script (`sbatch`/`srun` + `torchrun`).
- Behavior:
  - Submit Slurm job with requested node/GPU shape.
  - Set rendezvous env (`MASTER_ADDR`, `MASTER_PORT`, ranks).
  - Poll Slurm state and emit normalized status events.
  - On cancel, issue Slurm cancel command.

## Status Normalization
Provider adapters must map native statuses into control-plane statuses:
- `PENDING` -> `provisioning`
- `RUNNING` -> `running`
- `COMPLETED` -> `succeeded`
- `FAILED` -> `failed`
- `CANCELLED` -> `cancelled`

## Error Handling
- Retries happen at the control-plane attempt layer, not inside adapters.
- Adapters should return structured error class:
  - `capacity_unavailable`
  - `quota_exceeded`
  - `image_pull_error`
  - `runtime_error`
  - `user_cancelled`

## Non-Goals
- No data sharding logic in adapters.
- No checkpoint format logic in adapters.
