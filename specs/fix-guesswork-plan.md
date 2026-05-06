# Fix Guesswork And Source-Of-Truth Drift

Linear: TAH-282

## Purpose

This document captures the audit of candidate resolution, fallback behavior,
heuristics, and duplicated source-of-truth logic across the repo. The goal is
not to ban every fallback. The goal is to remove silent guesswork from runtime
contracts and keep intentional fallback paths explicit, bounded, and user
visible.

## Classification Rules

Use these rules when fixing the findings:

1. Runtime contracts must fail fast when required state is missing.
2. User-facing interactive recovery is allowed only when the user explicitly
   chooses the replacement value.
3. Object-store propagation retries are allowed when they are bounded and do
   not change semantic intent.
4. Cleanup and artifact upload may be best effort when the primary resource
   outcome is already decided.
5. Compatibility layers and fallback names should be removed unless explicitly
   approved for the current change.
6. Shared contracts should have one owning module or generated source.
7. Security-sensitive IDs, tokens, and share permissions must not rely on
   heuristic ownership checks or non-cryptographic randomness.
8. Build and validation guardrails should fail closed; do not hide type errors
   or deployment misconfiguration behind permissive defaults.

## Really Bad Quality Code

These are correctness risks and should be fixed first.

### API keys use non-cryptographic randomness

Files:

- `web/convex/ids.ts`
- `web/convex/auth.ts`
- `web/convex/runtimeProvisioning.ts`

`shortId` uses `Math.random()`, and API key plaintext is currently assembled
from two `shortId()` calls. That is not acceptable for secrets. The runtime
token path already uses `crypto.getRandomValues`, so the repo has a better
local pattern.

Fix direction:

- Stop using `shortId()` for API key material.
- Use cryptographic randomness for all API keys and bearer tokens.
- Keep non-secret display IDs separate from secret token generation.
- Respect the local `web/convex/auth.ts` ownership rule when implementing the
  fix; move reusable token generation into an allowed helper if needed.

### Data share ownership check ignores the requested data blob

File: `web/convex/sharing.ts`

`isOwner(..., "data", resourceId)` checks whether the current user owns any
`dataBlobs` row, not whether they own the requested `resourceId`. That can let
a user create a share link for another user's data whenever they own at least
one data blob.

Fix direction:

- Validate `resourceId` against the specific `dataBlobs` row being shared.
- Use the same canonical data identifier that the storage UI passes into share
  creation.
- Add authorization coverage for environment, run, and data share creation.

### Next build ignores TypeScript errors

File: `web/next.config.mjs`

`typescript.ignoreBuildErrors = true` lets production builds succeed with type
errors. That weakens the frontend validation contract and can hide broken API
or route types until runtime.

Fix direction:

- Remove `ignoreBuildErrors`.
- Fix any build/type errors that surface after removal.
- Keep `cd web && bun run lint` as the pre-commit validation for frontend and
  Convex changes.

### Missing entrypoint can report success

File: `runtime/warden/internal/train/train.go`

The runtime resolves the first `.py` token in the command and checks whether it
exists. If the file is missing, it logs `bootstrap only` and returns success.
That can make a broken training run look completed.

Fix direction:

- Do not infer an entrypoint from shell tokens.
- Execute the configured command directly.
- If command startup fails or the configured entrypoint is missing, mark the
  run failed with a clear error.

### Entrypoint resolution is heuristic

File: `runtime/warden/internal/train/train.go`

`resolveEntrypoint` guesses from command tokens by looking for a `.py` suffix.
This is brittle for `python -m`, shell wrappers, custom binaries, nested
scripts, or non-Python commands.

Fix direction:

- Delete entrypoint guessing.
- Treat `command` as canonical.
- If preflight validation is needed, model it as an explicit field in the
  bootstrap contract instead of parsing command tokens.

### CLI skips runtime catalog validation on fetch failure

File: `cli/project.go`

`validateAndResolveRuntimeConfig` skips framework/version/python validation
when the backend catalog cannot be fetched. That lets invalid config pass local
validation and fail later during environment/run creation.

Fix direction:

- For sync/run/serve execution paths, fail when catalog validation cannot be
  performed.
- If interactive `init` needs recovery behavior, make it explicit and require
  a user choice.
- Do not silently save unresolved runtime config.

### Framework detection scans raw text

File: `cli/project.go`

`detectFramework` reads raw `pyproject.toml` text and searches for words like
`torch`, `pytorch`, `tensorflow`, and `keras`. This can match comments,
unrelated package names, or strings outside dependency declarations.

Fix direction:

- Parse `pyproject.toml` as TOML.
- Inspect `[project.dependencies]` and `[dependency-groups]`.
- Prefer the selected train dependency group once it exists.
- Keep the prompt only when structured dependency data is ambiguous.

### Runtime image repo can produce invalid image names

File: `web/convex/catalog.ts`

The runtime image catalog builds image names with
`process.env.TAHUNA_RUNTIME_IMAGE_REPO` but does not validate that the value is
set. A missing env var can produce invalid image names in the catalog.

Fix direction:

- Validate `TAHUNA_RUNTIME_IMAGE_REPO` at catalog construction time.
- Fail with a deployment/configuration error if missing.
- Keep image tag construction in one catalog owner.

### GPU pricing violates strict mapping spec

Files:

- `web/cloud/billing/run-compute-pricing.ts`
- `web/cloud/providers/runpod-gpu-pricing.ts`
- `web/cloud/config.ts`
- `specs/ledger.md`

The ledger spec says GPU hourly inputs come from strict mapping with no
fallback. The implementation falls back to `unknownGpuPricePerHour` or the max
known GPU price when a GPU is unknown.

Fix direction:

- Decide one policy and update either code or spec.
- If strict mapping is the intended policy, unknown GPU pricing must fail
  before reservation or billing.
- If fallback pricing is intentional, document it in `specs/ledger.md` and make
  the fallback visible in API/UI responses.

### Dependency mode compatibility semantics should collapse

Files:

- `web/lib/dependency-selection.ts`
- `web/convex/schema.ts`
- `web/convex/runsLifecycle.ts`
- `web/convex/serves.ts`

`dependencyMode` appears to preserve compatibility around `dependencyGroup`.
Current project config already expresses the canonical semantic:
`dependency_group = ""` means base `[project.dependencies]`.

Fix direction:

- Use one field: `dependencyGroup`.
- Preserve empty string as the canonical base-dependencies value.
- Remove `dependencyMode` after any needed data migration.

## Fallbacks That Make Sense

These should generally stay, though some should be cleaned up or centralized.

### Default env var file lookup

File: `cli/env_vars.go`

`env_vars set` without arguments checks `.env.local` then `.env`. This is
documented behavior and returns a clear error when neither file exists.

Keep with cleanup:

- Move the ordered list into a shared constant or small helper.
- Keep the error explicit about the lookup order.

### Interactive no-capacity GPU fallback

File: `cli/capacity_fallback.go`

When Runpod reports no GPU capacity, interactive CLI flows ask the user to pick
another GPU. Non-interactive mode does not guess.

Keep:

- Continue requiring an explicit user selection.
- Continue excluding already failed choices in the same retry loop.
- Keep persistence/sync behavior explicit after a successful fallback.

### Warden selective dependency install then full sync

File: `runtime/warden/internal/deps/install.go`

The runtime may first skip protected prebaked packages when lockfile versions
match, then retry a full `uv sync` if selective sync fails. This is documented
in `specs/pod-bootstrap.md`.

Keep:

- Keep the fallback bounded to one full sync retry.
- Keep logs explicit about why protected package skip is disabled.
- Do not add more package-manager paths.

### Manifest upload and commit retry

File: `cli/sync.go`

The sync path retries commit after manifest upload because object-store
metadata propagation can lag. This is bounded retry behavior and does not
change the intended manifest hash.

Keep:

- Move retry constants to shared config if implementation work touches this
  area.
- Keep the final failure hard if the manifest still cannot be committed.

### Best-effort cleanup and artifact upload

Files:

- `web/convex/environments.ts`
- `web/convex/serves.ts`
- `runtime/warden/internal/artifacts/artifacts.go`

Cleanup and artifact upload warnings are acceptable when they happen after the
primary resource state is already known.

Keep with guardrails:

- Do not let cleanup failure mask successful deletion of control-plane rows.
- Do not let artifact upload failure turn a successful run into a failed run.
- Emit enough metadata to debug leaked objects.

## Needs A Unique Source Of Truth

These are not always bugs today, but they make future fixes brittle.

### Storage key and prefix builders

Files:

- `web/convex/cli/shared.ts`
- `web/convex/environments.ts`
- `web/convex/runs.ts`
- `web/convex/serves.ts`
- `web/convex/data.ts`

Manifest keys, blob keys, data prefixes, environment prefixes, run artifact
prefixes, and serve snapshot prefixes are built in multiple places.

Fix direction:

- Create one storage key module for Convex-side code.
- Export builders for blobs, manifests, data prefixes, environment prefixes,
  run output prefixes, and serve snapshot prefixes.
- Remove duplicate local builders.

### Environment data identity

Files:

- `web/convex/environments.ts`
- `web/convex/runsLifecycle.ts`
- `web/convex/runs.ts`
- `web/convex/storage.ts`

`dataId || environmentId` appears repeatedly. That fallback is now part of the
data ownership model, but it is not expressed as one named contract.

Fix direction:

- Backfill and require `dataId`, or centralize a helper such as
  `canonicalEnvironmentDataId`.
- Do not repeat `row.dataId || String(row._id)` inline.
- Update storage, runs, serves, and deletion code together.

### Share token and share route contract

Files:

- `web/components/features/dashboard/share-dialog.tsx`
- `web/convex/sharing.ts`
- `web/app/dashboard/page.tsx`

The dashboard generates `/share/{token}` URLs and Convex has a
`resolveShareToken` query, but the share route and access semantics are not
documented as one contract in this plan. This is not exactly guesswork in the
runtime path, but it is an incomplete source-of-truth boundary around
cross-account access.

Fix direction:

- Define the share URL, token resolution, permission semantics, and supported
  resource types in one spec section.
- Ensure the frontend route and backend query/mutations implement that same
  contract.
- Make unsupported resources fail explicitly instead of producing copyable
  links that do not resolve.

### Runtime and CLI defaults

Defaults are scattered across Go, TypeScript, Docker, and specs:

- Python version: `3.11`
- output dir: `outputs`
- train entrypoint: `train.py`
- serve entrypoint: `inference.py`
- serve port: `8000`
- runtime request timeout: `120`
- cancellation grace: `30`
- API URLs and browser URLs

Fix direction:

- Pick an owner for each default.
- Prefer a generated shared contract for CLI/runtime if feasible.
- At minimum, document every default in one spec and point code owners at that
  spec.

### URL/env var responsibility boundaries

Files:

- `web/convex/runtimeProvisioning.ts`
- `web/lib/auth-server.ts`
- `web/convex/auth.ts`
- `web/next.config.mjs`
- `docker/setup.sh`

Runtime callbacks correctly use `NEXT_PUBLIC_CONVEX_SITE_URL` as the strict
source of truth, but auth/server/Docker networking still use multiple fallback
chains.

Fix direction:

- Keep runtime callback URLs strict.
- Separate browser-facing URL, server-internal Convex URL, Convex site URL, and
  Next rewrite URL as named concerns.
- Avoid fallback chains between concerns unless the fallback is documented as
  deployment-only behavior.

### Dependency selection contract

Files:

- `cli/project.go`
- `web/lib/dependency-selection.ts`
- `web/convex/environments.ts`
- `web/convex/runsLifecycle.ts`
- `web/convex/serves.ts`
- `runtime/warden/internal/deps/install.go`

The intended contract is already clear: synced `dependency_group` is the
source of truth, and empty string means base `[project.dependencies]`.

Fix direction:

- Make the CLI always sync explicit train/serve dependency selections.
- Make backend run/serve creation fail if dependency selection is missing.
- Make Warden consume the synced value only.
- Delete compatibility fields once migrated.

## Other Heuristics And Compatibility Surfaces

These are lower severity than the runtime/security findings, but they should
stay visible so they do not become hidden contracts.

### CLI entrypoint flag parsing is shell-like but not shell-equivalent

File: `cli/project.go`

`parseShellCommand` manually tokenizes `--entrypoint-command` and
`--serve-entrypoint-command`. It supports simple quotes and escapes, but it is
not a full shell parser. That can surprise users who paste commands with env
assignments, command substitution, shell operators, or other shell syntax.

Fix direction:

- Prefer explicit TOML command arrays as the canonical config surface.
- For CLI flags, either document the supported tokenizer subset or accept
  repeated command-token flags instead of parsing a command string.
- Do not add more shell parsing behavior unless it is backed by a real parser.

### W&B-compatible monitoring uses protocol heuristics

File: `web/convex/monitoring/wandb.ts`

The W&B-compatible endpoint normalizes timestamps by guessing seconds vs
milliseconds from magnitude and extracts GraphQL operation names with a regex.
This may be acceptable for compatibility, but it should remain bounded to the
W&B compatibility surface and not leak into canonical Tahuna metrics APIs.

Fix direction:

- Keep these heuristics local to the W&B-compatible adapter.
- Prefer explicit timestamps and operation fields when Tahuna controls the
  client contract.
- Document tolerated compatibility behavior in tracking docs/specs.

### Legacy sync payload keys are still tolerated

File: `web/convex/cli/sync.ts`

`commitSync` still tolerates legacy `code_manifest` and `data_manifest` payload
keys while validating uploaded manifest objects. That may be a deliberate
migration window, but it conflicts with the repo rule against compatibility
layers unless explicitly requested.

Fix direction:

- Decide whether this compatibility window is still required.
- If required, document the removal condition and owner.
- If not required, remove the tolerated legacy keys in the same change that
  updates CLI/docs.

### Provider settings contain explicit MVP placeholders

Files:

- `web/components/cloud/dashboard/providers/providers-view.tsx`
- `web/components/cloud/dashboard/providers/providers-model.ts`

The providers view keeps local `activeProvider` state and renders disabled
GCP/Azure/AWS credential placeholders. This is visible product scaffolding, not
silent runtime guesswork, but it should be treated as incomplete cloud-provider
contract work.

Fix direction:

- Either persist active provider preference in Convex or remove the selector
  until multiple providers exist.
- Keep unsupported providers disabled until their credential and provisioning
  paths exist end to end.
- Avoid presenting provider choices that cannot affect run creation.

## Recommended Fix Order

1. Replace API key secret generation with cryptographic randomness.
2. Fix data share ownership to validate the specific requested resource.
3. Remove `ignoreBuildErrors` and fix any surfaced frontend type failures.
4. Make Warden fail on missing or unstartable configured commands.
5. Remove runtime entrypoint inference.
6. Make runtime catalog validation fail closed outside interactive recovery.
7. Replace raw text framework detection with structured TOML/uv parsing.
8. Validate runtime image repo env configuration.
9. Resolve GPU pricing policy mismatch between implementation and ledger spec.
10. Collapse dependency selection to one canonical field.
11. Centralize storage key builders.
12. Centralize or require environment `dataId`.
13. Consolidate defaults and URL/env var ownership.
14. Bound or remove lower-severity compatibility surfaces: CLI command string
    parsing, W&B heuristics, legacy sync payload keys, and provider placeholders.

## Validation Expectations For Follow-Up Fixes

Use affected-subrepo validation only:

- CLI changes: `make validate-cli`
- Warden changes: `make validate-warden`
- Frontend/Convex changes: `cd web && bun run lint`
- Frontend class guard: `rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'`

Tests should only be added or run when explicitly requested, except where the
repo validation command already includes tests.
