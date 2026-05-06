# Tahuna Cloud / Core Split Plan

This plan describes how to reach a clean `tahuna-core` / `tahuna-cloud`
split from the current monorepo without over-engineering the transition.

The goal is not to move files into two repositories first. The goal is to
make the boundary real inside the current codebase, then package it once the
dependency direction is already correct.

## Target Shape

### Core Owns

- Runtime contract: warden bootstrap, status, logs, metrics, artifacts.
- Domain model: runs, serves, environments, artifacts, logs, metrics,
  runtime tokens.
- Provider-neutral ports: `ObjectStore`, `ComputeProvider`, `JobQueue`,
  `AuthService`.
- CLI and self-hostable web/API behavior.
- Self-hostable deployment defaults.

### Cloud Owns

- Billing, credits, usage ledger, balance checks, reservations, and settlement.
- Hosted auth providers, email OTP, Resend, and hosted session composition.
- Hosted provider credential UX and Tahuna-operated secret custody.
- Vercel analytics, speed insights, hosted docs links, and cloud dashboards.
- Tahuna-operated provider defaults.

### Dependency Rule

`tahuna-cloud` may depend on `tahuna-core`.

`tahuna-core` must not depend on cloud billing, hosted auth providers, hosted
email, Convex, R2, Workpool, Vercel, Resend, Better Auth provider config, or
Tahuna-operated infrastructure.

## Corrected Migration Order

The split should follow this order:

1. Contract and vocabulary freeze.
2. Storage abstraction.
3. Auth/billing separation.
4. Compute provider abstraction.
5. Run lifecycle extraction.
6. Job queue boundary.
7. Frontend API facade.
8. Cloud module quarantine.
9. Boundary hardening after quarantine.
10. New backend implementation.
11. CLI switch.
12. Repo/package split.
13. Stale terminology and docs cleanup.

The important correction from the earlier OSS plan is that storage and
frontend access cannot wait until after backend extraction. Today they are
already part of the boundary problem.

## Current Boundary Risks

These are the current areas that must be corrected before the final split.

### Run Lifecycle Mixes Core, Cloud, Provider, and Jobs

Current run creation and runtime transitions mix:

- Core run state.
- Runpod provisioning.
- Credit reservation and billing settlement.
- Workpool and Convex scheduler behavior.

Current files:

- `web/convex/runsLifecycle.ts`
- `web/convex/runs.ts`
- `web/convex/schema.ts`

Correction:

- Extract pure run lifecycle functions.
- Make lifecycle code emit state transitions, events, and jobs.
- Move billing into an optional cloud policy.
- Move provisioning through `ComputeProvider`.
- Move scheduling through `JobQueue`.

### Runpod Leaks Beyond an Adapter

Runpod-specific terms and behavior currently appear in schema, runtime
provisioning, catalog reads, serving proxy code, CLI DTOs, and dashboard data.

Current files:

- `web/convex/runtimeProvisioning.ts`
- `web/convex/catalog.ts`
- `web/app/api/serves/[serveId]/inference/[[...path]]/route.ts`
- `cli/api_types.go`

Correction:

- Replace public `pod_id` with `machine_id` or `provider_machine_id`.
- Keep Runpod IDs inside provider records or adapter metadata only.
- Add `resolveRuntimeEndpoint` and `resolveIngressEndpoint` to the compute
  adapter contract.

### R2 Is Embedded Too Deeply

Storage is currently not a thin adapter. R2-specific clients and semantics are
used in runtime bootstrap, CLI sync, manifest handling, metadata checks, and
artifact handling.

Current files:

- `web/convex/runtimeBootstrap.ts`
- `web/convex/cli/shared.ts`
- `web/convex/cli/sync.ts`
- `web/convex/storage.ts`

Correction:

- Extract `ObjectStore`.
- Extract canonical storage key builders.
- Keep the current R2 implementation as an adapter.
- Make runtime bootstrap depend on signed object URLs and metadata, not R2.

### Auth Is Mixed With Billing And Hosted Providers

Auth currently includes Better Auth provider composition, Resend email OTP,
ledger initialization, credit reads, usage events, and API key behavior.

Current files:

- `web/convex/auth.ts`
- `web/convex/cli/shared.ts`

Correction:

- Core auth owns users, sessions, API keys, and runtime tokens.
- Billing owns credits, usage ledger, balance checks, and hosted spending
  policy.
- Hosted auth provider composition remains cloud code.
- `requireUser` and API key auth must not create ledgers or inspect credit
  state.

### Frontend Depends Directly On Convex

Dashboard containers and models import Convex hooks, generated APIs, and Convex
IDs directly.

Current files:

- `web/components/features/dashboard/runs-container.tsx`
- `web/components/features/dashboard-model.tsx`
- `web/components/convex-client-provider.tsx`
- `web/lib/auth-server.ts`

Correction:

- Add a typed Tahuna API facade.
- Keep the first implementation Convex-backed.
- Convert UI components to Tahuna DTOs instead of Convex IDs.
- Move cloud-only dashboard views behind cloud composition.

### Schema Plan Is Missing Real Product Surfaces

The first core schema must account for real behavior already in the product.

Current schema surfaces:

- `runs`
- `serves`
- `runEvents`
- `serveEvents`
- `runRuntimeLogs`
- `serveRuntimeLogs`
- `runRuntimeMetrics`
- `serveRuntimeMetrics`
- `envVars`
- `runtimeIncompatibilities`
- `wandbRuns`
- `wandbMetrics`
- `shareLinks`
- `dataBlobs`
- provider credentials and provider machine records

Correction:

- Include `serves` in core if serving remains part of OSS.
- Include env vars and runtime incompatibilities in core.
- Decide whether W&B-compatible tracking is core, cloud, or deferred.
- Treat share links as cloud or deferred collaboration until intentionally
  pulled into core.
- Do not migrate credits, usage ledger, or reservation accounting into core.

## PR Boundaries

Each PR should be one logical unit. Do not split the repository until the
boundary has already been enforced in code.

### PR 1: Correct The Split Specs

Goal:

Make the architecture specs match the real repo and the corrected migration
order.

Changes:

- Update `specs/tahuna-oss.md`.
- Keep this document as the concrete execution plan.
- Move storage abstraction before backend extraction.
- Add explicit `serves`, serve logs/events/metrics, env vars, runtime
  incompatibilities, artifacts, and provider accounts to the core schema plan.
- Replace late pod cleanup with an immediate canonical rename plan:
  `pod_id` -> `machine_id` or `provider_machine_id`.
- Add a durable job queue migration step for Convex scheduler and Workpool.
- Clarify that the Runpod adapter can be core, while hosted Runpod credential
  UX belongs to cloud.
- Clarify that billing cron, credits, and ledger are cloud-only.
- Add frontend API facade as an early migration step.

Validation:

- Review Markdown diff.
- `rg -n "pod_id|Convex required|R2 required|credits|ledger" specs`

Exit criteria:

- The docs describe the actual migration order.
- The docs no longer imply repo movement or Postgres extraction is the first
  boundary step.

### PR 2: Canonical Contracts And Names

Goal:

Freeze public vocabulary before extraction.

Changes:

- Replace public DTO/API names like `pod_id` with `machine_id` or
  `provider_machine_id`.
- Update CLI DTOs in `cli/api_types.go`.
- Update Convex response mappers in `web/convex/*Read.ts`.
- Update dashboard model types that expose provider machine identity.
- Keep Runpod-specific IDs only inside provider records or adapter metadata.

Boundary:

- One canonical external term.
- No compatibility aliases unless explicitly requested.

Validation:

- `make validate-cli`
- `cd web && bun run lint`
- `rg -n "pod_id|podId|pod " cli web runtime specs`

Exit criteria:

- Public contracts no longer expose Runpod pod terminology.
- Remaining `pod` references are either provider adapter internals or stale docs
  marked for cleanup.

### PR 3: Extract Runtime And Storage Contracts

Goal:

Remove R2 shape from core logic before backend architecture changes.

Changes:

- Create a core storage contract with:
  - `ObjectStore`
  - `SignedUpload`
  - `SignedDownload`
  - `ObjectMetadata`
  - `StorageKeyBuilder`
- Move key builders out of `web/convex/cli/shared.ts`.
- Make `web/convex/runtimeBootstrap.ts` depend on storage contracts instead of
  R2 directly.
- Keep the current R2 implementation as an adapter.
- Keep the existing object key layout stable unless an explicit rename is part
  of the PR.

Boundary:

- Core can say object store.
- Only adapter code can say R2 or S3 client.

Validation:

- `cd web && bun run lint`
- `rg -n "@convex-dev/r2|\\bR2\\b|HeadObjectCommand|CopyObjectCommand" web/convex`

Exit criteria:

- Runtime bootstrap and CLI sync use storage contracts.
- R2-specific calls are isolated to adapter modules.

### PR 4: Split Auth From Billing

Goal:

Make auth self-hostable and stop ledger side effects.

Changes:

- Remove credit and ledger initialization from `requireUser`.
- Remove credit and ledger initialization from API key auth.
- Create separate hosted billing lifecycle hooks.
- Keep API keys, sessions, and runtime tokens in core auth.
- Move credit reads, usage events, and hosted balance logic to cloud billing
  modules.

Boundary:

- Auth answers who the caller is.
- Billing answers whether hosted spending is allowed.

Validation:

- `cd web && bun run lint`
- `rg -n "credits|ledger|usageEvents|balance" web/convex/auth.ts web/convex/cli/shared.ts`

Exit criteria:

- Core auth can run without credit tables.
- Cloud billing can still compose hosted balance behavior.

### PR 5: Compute Provider Port

Goal:

Isolate Runpod without losing current behavior.

Changes:

- Introduce `ComputeProvider` with methods equivalent to:
  - `listOffers`
  - `createMachine`
  - `getMachine`
  - `terminateMachine`
  - `resolveRuntimeEndpoint`
  - `resolveIngressEndpoint`
- Move Runpod REST and GraphQL calls out of lifecycle code.
- Move Runpod proxy URL generation out of serving route code.
- Store provider-specific machine IDs in generic provider records.

Boundary:

- Core lifecycle talks to `ComputeProvider`.
- Runpod adapter talks to Runpod.

Validation:

- `cd web && bun run lint`
- `rg -n "runpod|Runpod|proxy.runpod.net|podId|runpodCredentialId" web/convex web/app cli`

Exit criteria:

- Runpod references are adapter-owned or credential-UX-owned.
- Core code uses generic provider and machine terminology.

### PR 6: Run Lifecycle Core Extraction

Goal:

Pull the actual domain state machine out of Convex and cloud details.

Changes:

- Extract pure run lifecycle functions from `web/convex/runsLifecycle.ts` and
  `web/convex/runs.ts`.
- Inputs should be run request, environment, artifacts, provider offer, and
  current state.
- Outputs should be state transitions, events, jobs to enqueue, and storage
  operations to request.
- Billing becomes an optional cloud policy.
- Runtime status ingestion remains provider-neutral.

Boundary:

- Core owns run state.
- Cloud may observe run state to charge hosted usage.

Validation:

- `cd web && bun run lint`
- `rg -n "creditsReserved|computeCharge|settleRunComputeCharge|billRunningCompute" web/convex/runs*.ts`

Exit criteria:

- Run state transitions can be tested without Convex, Runpod, R2, or billing.
- Cloud billing hooks are outside the lifecycle state machine.

### PR 7: Durable Job Queue Boundary

Goal:

Replace Convex scheduler and Workpool assumptions with a portable job model.

Changes:

- Define job types:
  - `provision_run`
  - `check_startup_timeout`
  - `terminate_machine`
  - `finalize_artifact`
  - `cleanup_failed_upload`
- Add idempotency keys.
- Keep Convex scheduler as the current adapter.
- Allow a later Postgres worker to consume the same job records/contracts.

Boundary:

- Core emits jobs.
- Adapter schedules and runs jobs.

Validation:

- `cd web && bun run lint`
- `rg -n "workpool|scheduler.runAfter|crons" web/convex`

Exit criteria:

- Core lifecycle no longer depends directly on Convex scheduler or Workpool.
- Billing cron is not part of the core job model.

### PR 8: Frontend API Facade

Goal:

Stop React components from depending directly on Convex.

Changes:

- Add a typed client facade for dashboard data and actions.
- Convert containers such as `web/components/features/dashboard/runs-container.tsx`
  away from direct `useQuery(api...)`.
- Remove Convex `Id` from shared dashboard models.
- Keep a Convex-backed implementation under the facade for now.

Boundary:

- UI uses Tahuna DTOs.
- Data provider can be Convex today and HTTP tomorrow.

Validation:

- `cd web && bun run lint`
- `rg -l "convex/react|@convex/_generated|@convex/" web/app web/components web/lib`
- `rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'`

Exit criteria:

- Feature components no longer import Convex generated APIs directly.
- Cloud-only dashboard views are composition points, not core UI assumptions.

### PR 9: Cloud Module Quarantine

Goal:

Make hosted-only code visibly cloud-owned.

Changes:

- Move billing, credits, hosted auth provider config, Resend email, Vercel
  analytics, cloud docs/changelog links, and hosted provider credential UX under
  explicit cloud module paths.
- Make dashboard billing view cloud-only.
- Ensure core build does not require cloud env vars.

Boundary:

- Core can run without billing, email, analytics, hosted provider defaults, or
  cloud dashboard features.
- Cloud composes those features on top of core.

Validation:

- `cd web && bun run lint`
- `rg -n "Resend|credits|ledger|NEXT_PUBLIC_VERCEL|billing|TAHUNA_DOCS_URL" web`

Exit criteria:

- Hosted-only modules are physically obvious.
- Core import graph does not cross into cloud modules.

### PR 9.5: Boundary Hardening Before Backend Extraction

Goal:

Turn the PR9 physical quarantine into an enforceable dependency boundary before
starting the Postgres/API backend. PR10 must not begin while core-adjacent code
still imports cloud billing, hosted auth, hosted provider defaults, Runpod
credential tables, R2, Workpool, or Convex scheduler concepts as product
contracts.

Why this exists:

After PR9 the repository has useful `core` and `cloud` directories, but the
split is still mostly physical. Some core paths still call cloud policy
directly, some generic provider fields still point at Runpod credential tables,
and serves do not use the same lifecycle/job boundary as runs. Starting PR10 in
that state would bake the leaks into the new backend.

Implementation order:

1. Add import-graph guardrails.
   - Extend the web lint configuration so `web/convex/core/**` cannot import:
     `@/cloud/*`, `@convex/cloud/*`, `@convex/_generated/*`,
     `@convex-dev/*`, `convex/react`, R2, Resend, Better Auth, or Workpool.
   - Add narrower restrictions for core-adjacent Convex implementation modules
     so only explicit composition/adapter modules may import cloud modules.
   - Keep the rule exceptions small and named. If an exception is needed, make
     the file name reveal the adapter/composition role.

2. Make provider credential naming generic in core rows and lifecycle code.
   - Replace run/serve field and symbol names such as `runpodCredentialId` with
     `providerCredentialId` in schema-facing core/domain code.
   - Keep Runpod-specific credential table access inside cloud/provider adapter
     code only.
   - Store provider credential references as generic strings at core boundaries;
     cast to the current Convex Runpod credential table ID only inside the
     Convex/Runpod adapter.
   - Do not add compatibility aliases unless explicitly requested. Grep for all
     stale names before finishing.

3. Remove hosted billing policy from the core run lifecycle plan.
   - Delete `hostedUsage` and `includeHostedUsageSettlement` from
     `web/convex/core/runLifecyclePlan.ts`.
   - Make terminal lifecycle plans emit provider-neutral events, timing hints,
     and state patches only.
   - Move hosted billing settlement into an injected cloud policy/composition
     layer called by the Convex implementation, not by core plan code.
   - Keep storage usage charging in cloud policy, not in data/storage core
     helpers.

4. Split run creation into core planning plus cloud composition.
   - Core creation should decide canonical run fields, manifests, provider
     request fields, and initial lifecycle event.
   - Cloud composition should compute hosted hourly rates, initialize hosted
     billing fields, enforce hosted balance policy, and attach hosted-only
     metadata.
   - `web/convex/runsLifecycle.ts` must not import `@/cloud/*` or
     `@convex/cloud/*` after this PR.

5. Move Runpod hosted defaults and pricing out of the core compute adapter.
   - The Runpod adapter can remain a core/provider adapter, but it must receive
     cloud type/default placement policy and optional pricing from injected
     config or cloud composition.
   - `web/convex/runpodComputeProvider.ts` must not import `@/cloud/*`.
   - GPU catalog DTOs may include provider offer prices only if the price source
     is adapter-neutral or explicitly cloud-composed.

6. Bring serves to the same boundary quality as runs.
   - Extract serve lifecycle planning into a core module, or extend the existing
     lifecycle plan style so serve state transitions are pure.
   - Add serve job types for provisioning, startup timeout, machine
     termination, and cleanup where needed.
   - Route serve scheduling through the same job queue adapter pattern instead
     of direct Workpool/scheduler calls in `web/convex/servesLifecycle.ts`.
   - Keep serve inference endpoint resolution provider-neutral through
     `ComputeProvider.resolveIngressEndpoint`.

7. Keep storage object-store-neutral outside the R2 adapter.
   - `@convex-dev/r2`, `HeadObjectCommand`, `CopyObjectCommand`, and R2 client
     semantics should remain in `web/convex/r2ObjectStore.ts` and Convex app
     configuration only.
   - UI copy should say object storage/storage unless it is specifically
     explaining the hosted R2 adapter.

8. Separate core and cloud dashboard composition.
   - The default dashboard shell should be able to render core views without
     credits, hosted billing bootstrap, provider credential UX, cloud docs
     links, or Vercel analytics.
   - Cloud dashboard composition may wrap the core dashboard and add billing,
     providers, cloud nav links, usage meter, and hosted account setup.

Boundary:

- `web/convex/core/**` has no dependency on Convex-generated APIs, cloud
  modules, hosted auth, billing, R2, Resend, Better Auth, Workpool, or Vercel.
- Core rows and DTOs use generic provider and object-store names.
- Cloud policy composes billing, credits, hosted provider credentials, hosted
  auth/email, analytics, and cloud dashboard additions.
- Convex, R2, and Workpool are current adapters, not core product contracts.

Validation:

- `cd web && bun run lint`
- `make validate-cli` if CLI DTOs or user-facing CLI output changed.
- `rg -n "@/cloud|@convex/cloud" web/convex --glob '!web/convex/cloud/**' --glob '!web/convex/_generated/**'`
- `rg -n "runpodCredentialId|Id<\"runpodCredentials\">|providerCredentialId: v\\.id\\(\"runpodCredentials\"\\)" web/convex web/lib web/components cli --glob '!web/convex/cloud/**' --glob '!web/convex/_generated/**'`
- `rg -n "hostedUsage|includeHostedUsageSettlement|initialHostedRunBillingFields|settleHostedRunUsage|resolveRunComputePricing" web/convex/core web/convex/runsLifecycle.ts web/convex/servesLifecycle.ts`
- `rg -n "@convex-dev/r2|\\bR2\\b|HeadObjectCommand|CopyObjectCommand" web/convex --glob '!web/convex/r2ObjectStore.ts' --glob '!web/convex/convex.config.ts' --glob '!web/convex/_generated/**'`
- `rg -n "@convex-dev/workpool|scheduler\\.runAfter" web/convex/runsLifecycle.ts web/convex/servesLifecycle.ts web/convex/runs.ts web/convex/serves.ts`
- `rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'`

Exit criteria:

- The import graph makes the dependency rule mechanically visible.
- Run and serve lifecycle planning can be reasoned about without hosted
  billing, Runpod credential storage, R2, Workpool, or Convex scheduler details.
- Hosted billing/storage usage/provider credential behavior is preserved, but
  lives in cloud composition or adapter code.
- No public or core-adjacent contract uses Runpod-specific credential naming.
- PR10 can introduce a backend against core contracts without copying cloud
  leaks into the new implementation.

Prompt for the next agent:

```text
You are working in this repository on branch functional-split.
Follow AGENTS.md exactly. This is an implementation task: implement PR9.5 from
specs/cloud-core-split.md, one logical unit, without starting PR10.

Goal:
Make the existing PR9 cloud/core quarantine dependency-clean before backend
extraction. Do not split repos. Do not introduce compatibility aliases unless
explicitly asked. Do not modify web/convex/auth.ts unless the change is
unavoidable and you explain why first.

Required work:
1. Add lint/import guardrails so web/convex/core/** cannot import cloud,
   Convex-generated APIs, R2, Resend, Better Auth, Workpool, or Vercel.
2. Replace core/domain run and serve credential naming from runpodCredentialId
   to providerCredentialId. Keep Runpod table access inside adapter/cloud code.
3. Remove hostedUsage/includeHostedUsageSettlement and direct hosted billing
   imports from core run lifecycle planning. Move billing settlement to cloud
   composition around the Convex implementation.
4. Refactor run creation so core planning stays provider-neutral and cloud
   composition owns hosted hourly rates and hosted billing fields.
5. Remove cloud defaults/pricing imports from web/convex/runpodComputeProvider.ts
   by injecting or composing placement/pricing policy outside the adapter.
6. Bring serves to parity with runs: pure lifecycle planning where practical and
   job queue adapter usage instead of direct Workpool/scheduler calls in serve
   lifecycle code.
7. Keep R2-specific code isolated to web/convex/r2ObjectStore.ts and Convex app
   config; adjust user-facing copy that says R2 when the surface is generic.
8. Keep the dashboard core/cloud composition split clean: core views should not
   require credits, provider credential UX, cloud docs links, Vercel analytics,
   or hosted billing bootstrap.

Validation:
- cd web && bun run lint
- make validate-cli if CLI DTOs or output changed
- rg -n "@/cloud|@convex/cloud" web/convex --glob '!web/convex/cloud/**' --glob '!web/convex/_generated/**'
- rg -n "runpodCredentialId|Id<\"runpodCredentials\">|providerCredentialId: v\\.id\\(\"runpodCredentials\"\\)" web/convex web/lib web/components cli --glob '!web/convex/cloud/**' --glob '!web/convex/_generated/**'
- rg -n "hostedUsage|includeHostedUsageSettlement|initialHostedRunBillingFields|settleHostedRunUsage|resolveRunComputePricing" web/convex/core web/convex/runsLifecycle.ts web/convex/servesLifecycle.ts
- rg -n "@convex-dev/r2|\\bR2\\b|HeadObjectCommand|CopyObjectCommand" web/convex --glob '!web/convex/r2ObjectStore.ts' --glob '!web/convex/convex.config.ts' --glob '!web/convex/_generated/**'
- rg -n "@convex-dev/workpool|scheduler\\.runAfter" web/convex/runsLifecycle.ts web/convex/servesLifecycle.ts web/convex/runs.ts web/convex/serves.ts
- rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'

Linear:
Search Linear before changing code. If no better issue exists, use TAH-293 or
create/update the appropriate issue with Agent: Codex, delegate Codex, final
validation results, and commit hash. Do not leave completed work in Todo or
Backlog.

Before finishing:
Show the remaining boundary-search output. If any validation grep still returns
hits, classify each as allowed adapter/composition code or fix it.
```

### PR 10: Postgres/API Backend Skeleton

Goal:

Introduce the self-hostable backend after contracts are stable.

Changes:

- Add a minimal backend using the corrected schema.
- Implement core auth, sessions, API keys, and runtime tokens.
- Implement object store adapter using S3-compatible config.
- Implement compute adapter using Runpod behind the generic provider interface.
- Keep Convex implementation running until parity is validated.

Boundary:

- Backend depends on core contracts.
- Convex is no longer the contract.

Validation:

- Backend build/lint command.
- `make validate-cli`
- Smoke run lifecycle through local API.

Exit criteria:

- A local backend can perform the minimal run lifecycle without hosted cloud
  services.
- Convex remains an implementation detail during migration, not the canonical
  interface.

### PR 11: CLI Switch To Core API

Goal:

Make CLI target the new HTTP contract.

Changes:

- Remove Convex-specific wording from CLI errors.
- Point CLI DTOs at the canonical core API.
- Ensure `TAHUNA_API_URL` works for both self-hosted and cloud deployments.

Validation:

- `make validate-cli`

Exit criteria:

- CLI works against the self-hosted backend and the hosted cloud API.
- CLI no longer references Convex as the local backend expectation.

### PR 12: Final Split

Goal:

Create actual `tahuna-core` / `tahuna-cloud` packaging once boundaries are
real.

Changes:

- Move core packages, runtime, CLI, core web/API, storage/compute interfaces,
  and default self-host compose into `tahuna-core`.
- Move hosted billing, hosted auth composition, email, analytics, hosted
  dashboards, and cloud-specific integrations into `tahuna-cloud`.
- Keep cloud depending on core.
- Delete stale docs/specs that describe Convex, R2, or Runpod as required
  architecture.

Validation:

- Core runs locally without hosted env vars.
- Cloud build still composes hosted features.
- `rg -n "Convex|R2|Resend|credits|ledger|Vercel|Better Auth|Workpool" tahuna-core`

Exit criteria:

- `tahuna-core` is self-hostable.
- `tahuna-cloud` is the hosted product layer.
- Core has no dependency on cloud.

## First Extraction Targets

Start with modules that are either already close to core or are small enough to
extract without changing behavior.

1. `runtime/warden/internal/runtimeapi`
   - Already close to provider-neutral runtime contracts.
   - Freeze this before changing backend shape.

2. `runtime/warden/internal/config`
   - Mostly core-friendly environment parsing.
   - Keep it simple and avoid hosted assumptions.

3. `web/convex/syncManifest.ts`
   - Good pure extraction target for manifest parsing and hash behavior.

4. Storage key builders in `web/convex/cli/shared.ts`
   - Move into a core storage module.
   - Leave R2 URL generation in the adapter.

5. `web/convex/runtimeBootstrap.ts`
   - Convert into a pure bootstrap-plan builder with injected storage.

6. `web/convex/runsRead.ts`
   - Convert into DTO mapping after `pod_id` and billing fields are removed.

7. `web/convex/runsLifecycle.ts`
   - Extract after billing and Runpod credential lookup are behind ports.

## Non-Goals

- Do not split repositories before dependency direction is correct.
- Do not introduce compatibility aliases unless explicitly requested.
- Do not migrate billing tables into core.
- Do not create a generic plugin framework before the first adapter boundary is
  proven.
- Do not rewrite the frontend wholesale before a typed API facade exists.
- Do not preserve stale Convex/R2/Runpod terminology as public contract.

## Definition Of Done

The split is complete when:

- `tahuna-core` runs locally without Convex Cloud, hosted billing, hosted email,
  Vercel, Resend, Workpool, or Tahuna-operated credentials.
- `tahuna-cloud` composes hosted billing, hosted auth, hosted provider
  credentials, analytics, and cloud dashboards on top of core.
- CLI works against both self-hosted core and hosted cloud through the same
  canonical HTTP contract.
- Runtime warden talks only to the core runtime contract.
- Provider-specific machine IDs are adapter metadata, not product vocabulary.
- Storage is object-store-neutral at the core boundary.
- Cloud depends on core; core does not depend on cloud.
