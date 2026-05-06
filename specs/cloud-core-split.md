# Cloud And Core Boundary

Last reviewed: 2026-05-07

## Current Behavior

Tahuna is currently one monorepo with a hosted cloud implementation. There is already some separation between core planning modules and cloud/provider composition, but Convex remains the active backend.

## Core-Like Code Today

These modules are provider-neutral or close to it:

- `web/convex/core/runLifecyclePlan.ts`
- `web/convex/core/serveLifecyclePlan.ts`
- `web/convex/core/storage.ts`
- `web/convex/core/jobQueue.ts`
- `web/convex/core/compute.ts`
- `web/convex/runtimeBootstrap.ts`
- `runtime/warden/*`

They define lifecycle statuses, state transition plans, storage key helpers, bootstrap plan materialization, and runtime behavior.

## Cloud Code Today

Cloud-specific code includes:

- Convex schema and HTTP routes.
- Better Auth integration.
- Runpod credentials and Runpod compute provider.
- Hosted credits ledger and usage billing.
- Dashboard providers/billing views.
- R2 object-store adapter.

## Boundary In Practice

Run and serve creation combine core lifecycle plans with cloud-specific composition. Billing and provider credentials are attached around the lifecycle, not owned by the runtime.

## Invariants

- Convex is the active backend.
- Runpod is the active compute provider.
- R2-compatible object storage is the active object store.
- This document is not an extraction plan.
