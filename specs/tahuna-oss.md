# Tahuna OSS

Last updated: 2026-03-24

## Objective

Build a standalone, open-source, self-hostable version of Tahuna that:

- keeps Tahuna's core value proposition: reproducible GPU training orchestration, incremental sync, runtime materialization, CLI + web workflows, and monitoring
- removes hosted-product concerns that do not belong in the OSS core
- supports multiple compute providers through explicit adapters
- ships with a clean local deployment story via Docker Compose

This OSS version must support:

- a standalone backend control plane
- a web UI
- the CLI
- the runtime agent (`warden`)
- object storage for sync/manifests/artifacts
- pluggable compute providers, starting with Runpod and GCP

## Non-Goals

The OSS version must not include:

- payments
- credits
- ledger accounting
- balance tracking
- pricing-based run admission
- hosted-only business logic layered on top of compute usage

Any existing billing, credits, or ledger functionality in the current codebase is out of scope for OSS and should be removed from the standalone architecture rather than ported.

## Product Boundary

The OSS product should include:

- project and environment management
- code sync and data sync
- run creation, cancellation, logs, metrics, and artifacts
- runtime bootstrap and training execution
- provider adapters for GPU provisioning
- provider adapters for object storage
- browser auth and API keys only to the extent needed for self-hosting

The OSS product should not depend on:

- Convex as a required backend runtime
- Cloudflare R2 as the only object store
- Runpod as the only compute provider
- any billing-related table, API, UI, or workflow

## Architecture Decision

Tahuna OSS should move to a conventional self-hosted control plane:

- `Postgres` as the system of record
- an API service for CLI, web, and runtime callbacks
- a worker service for asynchronous provisioning and cleanup jobs
- S3-compatible object storage as the default storage abstraction
- Docker Compose as the default local deployment mode

### Why not keep Convex as the primary backend

Convex worked well for rapid product iteration, but it is not the best fit for the OSS target because Tahuna OSS needs:

- explicit self-hosting
- explicit background workers
- clean provider abstractions
- explicit local deployment topology
- standard operational primitives for contributors and users

For the OSS version, Convex should be treated as legacy product infrastructure, not as the target architecture.

### Why Postgres

Postgres is the default database for Tahuna OSS because it fits the actual data model:

- runs, environments, API keys, runtime tokens, events, storage indexes, and provider state are relational control-plane data
- the self-hosting story is much simpler and more standard
- schema migrations, backups, debugging, and cloud portability are straightforward

Mongo-compatible databases are not the default recommendation. Tahuna's core data model does not benefit enough from document-first storage to justify the extra operational surface.

## Target Services

Tahuna OSS should be split into the following services:

### 1. API

The API service is the control plane. It owns:

- auth
- environments
- runs
- storage metadata
- runtime callback endpoints
- provider selection and validation
- signed URL generation through the storage adapter

### 2. Worker

The worker service owns asynchronous jobs:

- machine provisioning
- machine status polling
- termination and cleanup
- artifact finalization
- stale resource reconciliation

The worker should share the same codebase and database schema as the API, but run as a separate process role.

### 3. Web

The web app should become a pure frontend over the API. It should not embed backend business logic directly in the frontend app.

### 4. Runtime

`warden` remains the in-machine runtime agent. It should stay focused on:

- fetching the runtime bootstrap contract
- materializing code and data
- installing dependencies
- executing training
- streaming logs and metrics
- uploading artifacts

### 5. Platform Dependencies

The default self-hosted stack should include:

- Postgres
- MinIO for local object storage
- optional local SMTP sink for email-based auth development

## Core Interfaces

Tahuna OSS should be organized around explicit interfaces instead of vendor-specific code paths.

### Compute Provider Interface

The core compute abstraction should expose:

- `listOffers`
- `createMachine`
- `getMachine`
- `terminateMachine`
- `validateConfig`

The core model should use normalized terms:

- `provider`
- `machine_id`
- `gpu_model`
- `gpu_count`
- `region`
- `zone`
- `status`
- `public_ip`
- `price_hourly_cents` only as optional metadata, never for billing enforcement

Provider-native terms such as `pod` must not leak into the core schema.

### Object Storage Interface

The storage abstraction should expose:

- `putPresignedUpload`
- `getPresignedDownload`
- `head`
- `delete`
- `list`

The default implementation should target S3-compatible APIs so the same abstraction works for:

- MinIO
- AWS S3
- Cloudflare R2

Native GCS or Azure Blob support can be added later if needed, but the object model should stay provider-neutral.

### Auth Boundary

Tahuna OSS still needs authentication, but auth must be treated as infrastructure, not product differentiation.

The minimum supported OSS auth surface should be:

- browser login
- session auth for the web UI
- API keys for the CLI

The auth implementation must remain independent from billing or usage balances.

## Provider Strategy

### Runpod

Runpod is the first provider to preserve current behavior. Its role in OSS is:

- baseline compute adapter
- compatibility target during migration
- reference implementation for the provider interface

### GCP

GCP is the second provider to implement.

The first GCP adapter should target `Google Compute Engine`, not Vertex AI.

Reason:

- it maps more directly to Tahuna's current machine lifecycle
- it matches the current runtime bootstrap model
- it avoids introducing a second orchestration model too early

The GCP adapter should:

- create GPU VMs
- inject runtime configuration at startup
- expose instance identity and status through the common adapter model
- terminate machines cleanly on completion, failure, or cancellation

### Future Providers

After Runpod and GCP, the same interface should support:

- AWS via EC2 first
- Azure via Virtual Machines first
- managed-job providers later if Tahuna needs them

## Data Model Direction

The first Postgres schema should cover:

- `users`
- `api_keys`
- `environments`
- `runs`
- `run_events`
- `run_logs`
- `run_metrics`
- `storage_objects`
- `artifacts`
- `runtime_tokens`
- `provider_accounts`
- `provider_machine_records`

The schema must not include:

- `user_credits`
- `usage_events` for billing
- balance fields
- run reservation accounting

If the current codebase has billing-related tables or fields, they should be omitted from the OSS schema rather than migrated.

## Docker Compose Objective

Tahuna OSS must be easy to run locally with one command and a clean `.env` file.

The default Compose topology should be:

- `postgres`
- `minio`
- `api`
- `worker`
- `web`

`warden` should not run as a permanent Compose service in the normal local stack. It is the runtime payload executed inside provisioned machines. A dedicated local test target for runtime development can exist separately.

## Environment Variable Rules

The OSS environment layout should be explicit and grouped by subsystem.

### Shared

- `TAHUNA_APP_MODE=selfhosted`
- `TAHUNA_PUBLIC_URL`
- `TAHUNA_API_URL`

### Database

- `TAHUNA_DATABASE_URL`

### Auth

- `TAHUNA_AUTH_SECRET`
- `TAHUNA_SESSION_COOKIE_SECRET`

### Object Storage

- `TAHUNA_OBJECT_STORE=s3`
- `TAHUNA_S3_ENDPOINT`
- `TAHUNA_S3_REGION`
- `TAHUNA_S3_BUCKET`
- `TAHUNA_S3_ACCESS_KEY_ID`
- `TAHUNA_S3_SECRET_ACCESS_KEY`
- `TAHUNA_S3_FORCE_PATH_STYLE=true`

### Compute

- `TAHUNA_COMPUTE_PROVIDER`
- `TAHUNA_RUNPOD_API_KEY`
- `TAHUNA_GCP_PROJECT_ID`
- `TAHUNA_GCP_REGION`
- `TAHUNA_GCP_ZONE`
- `GOOGLE_APPLICATION_CREDENTIALS`

### Runtime

- `TAHUNA_RUNTIME_IMAGE_REPO`
- `TAHUNA_RUNTIME_CALLBACK_BASE_URL`
- `TAHUNA_RUNTIME_REQUEST_TIMEOUT_SECONDS`

### Web

- `NEXT_PUBLIC_TAHUNA_API_URL`

### CLI

- `TAHUNA_API_URL`

Env var rules:

- keep one `.env.example` as the canonical template
- allow `.env.local` for developer overrides
- validate required variables at API startup
- do not keep legacy Convex-specific env names in the OSS path

## Phases

## Phase 0: OSS Scope Lock

### Objective

Freeze the OSS product boundary before implementation starts.

### Deliverables

- this spec
- explicit removal decision for payments, credits, and ledger accounting
- decision to target Postgres + object storage + worker-based control plane
- decision to support Runpod and GCP adapters

### Exit Criteria

- no OSS workstream assumes billing features will remain
- no new architecture work depends on Convex-specific primitives

## Phase 1: Control Plane Extraction

### Objective

Create a standalone backend service outside `web/convex` and preserve the current HTTP contract where practical.

### Scope

- introduce `backend/` as the standalone API + worker codebase
- move run lifecycle, environment lifecycle, sync endpoints, storage metadata, and runtime callbacks into the new backend
- keep CLI-facing paths stable when possible to reduce migration risk

### Deliverables

- API service scaffold
- worker scaffold
- Postgres schema and migrations
- basic healthcheck and config validation

### Exit Criteria

- the backend can run without Convex
- the CLI can talk to the new API for basic health/auth/environment flows

## Phase 2: Storage Abstraction

### Objective

Replace direct object-store coupling with an explicit storage adapter layer.

### Scope

- extract signed upload/download behavior behind an object storage interface
- implement S3-compatible storage
- support MinIO locally
- preserve the manifest/blob contract used by CLI sync and runtime materialization

### Deliverables

- storage adapter interface
- S3-compatible implementation
- local MinIO integration in Docker Compose

### Exit Criteria

- sync and runtime materialization work through the new storage abstraction
- no core flow depends directly on R2-only APIs

## Phase 3: Compute Adapter Extraction

### Objective

Move provisioning logic behind a provider-neutral compute interface.

### Scope

- extract Runpod-specific logic from the current run lifecycle path
- normalize provider-facing resource naming
- move provider state into adapter-owned records

### Deliverables

- compute adapter interface
- Runpod adapter implementation
- normalized machine lifecycle model

### Exit Criteria

- core run creation no longer calls Runpod directly
- Runpod works through the adapter boundary only

## Phase 4: GCP Adapter

### Objective

Add GCP as the second compute provider.

### Scope

- implement a GCE-based compute adapter
- create GPU VMs with startup configuration for `warden`
- support status polling and termination

### Deliverables

- GCP adapter
- provider config validation
- end-to-end run flow using GCP

### Exit Criteria

- a run can be launched on GCP without Runpod-specific fallback paths
- the same CLI and web flows work across both providers

## Phase 5: Web Decoupling

### Objective

Turn the web app into a clean frontend over the standalone API.

### Scope

- remove direct Convex data dependencies from the frontend
- replace backend-coupled frontend queries/mutations with API client calls
- remove billing UI and related navigation

### Deliverables

- API-backed frontend data layer
- billing-free dashboard structure
- self-hosted auth flow wired through the new backend

### Exit Criteria

- the web app runs without Convex
- the dashboard exposes only OSS-relevant product surfaces

## Phase 6: Docker Compose and Self-Hosting

### Objective

Ship a clean local deployment and self-hosting experience.

### Scope

- add `docker-compose.yml`
- add `.env.example`
- define API, worker, web, Postgres, and MinIO services
- document local startup and first-run setup

### Deliverables

- Compose stack
- container images or Dockerfiles for API, worker, and web
- self-hosting documentation

### Exit Criteria

- a contributor can run Tahuna OSS locally with Docker Compose
- CLI and web both work against the local stack

## Phase 7: OSS Hardening

### Objective

Prepare the repository for public open-source distribution.

### Scope

- remove stale hosted terminology
- remove or archive specs that assume billing is part of the product
- update docs, env templates, and examples
- clean references to Convex-first architecture where no longer applicable

### Deliverables

- cleaned docs set
- installation guide
- architecture overview
- contribution guide

### Exit Criteria

- the repo presents one coherent OSS architecture
- docs match the actual self-hosted deployment path

## Implementation Priorities

The implementation order should be:

1. lock the OSS scope
2. extract the backend control plane
3. abstract storage
4. abstract compute
5. preserve Runpod through an adapter
6. add GCP through the same adapter
7. decouple the web app from Convex
8. add Docker Compose and self-hosting docs

## Success Criteria

Tahuna OSS is successful when:

- it runs standalone without Convex
- it runs locally through Docker Compose
- it uses Postgres as the control-plane database
- it uses object storage through a clean adapter
- it supports Runpod and GCP through the same compute abstraction
- it keeps the current sync and runtime strengths
- it does not include payments, credits, or ledger accounting
