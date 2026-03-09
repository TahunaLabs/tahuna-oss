# Provider Adapters

Last updated: 2026-03-09

## Current State
There is one concrete provider path today: Runpod, embedded in backend logic.

Implemented behavior:
- Resolve GPU type through Runpod GraphQL catalog.
- Create pod through Runpod REST API (`/v1/pods`).
- Inject runtime env vars (run id, manifest hashes/keys, runtime token, API base).
- Start bootstrap command that materializes workspace and sends runtime callbacks.
- Fail run immediately on provisioning errors.

Capacity behavior:
- If provisioning fails with no capacity, run creation returns `409` and run is removed.

## Where It Lives
- Runpod provisioning logic: [`web/convex/runs.ts`](../web/convex/runs.ts)
- Strict create+provision behavior: [`web/convex/cli.ts`](../web/convex/cli.ts)

## Target Adapter Interface
```text
submit(run_spec) -> provider_job_id
status(provider_job_id) -> normalized_status
cancel(provider_job_id) -> accepted
```

## Planned Providers
- `runpod` (existing path, to be extracted behind interface)
- `lambda` (not implemented yet)

## Extraction Plan
1. Move Runpod-specific calls out of `runs.ts` into a provider module.
2. Keep a provider-neutral run spec and normalized statuses.
3. Add Lambda implementation with same contract.
