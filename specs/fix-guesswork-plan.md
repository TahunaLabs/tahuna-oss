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

## Really Bad Quality Code

These are correctness risks and should be fixed first.

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

- `web/lib/run-compute-pricing.ts`
- `web/lib/runpod-gpu-pricing.ts`
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

## Recommended Fix Order

1. Make Warden fail on missing or unstartable configured commands.
2. Remove runtime entrypoint inference.
3. Make runtime catalog validation fail closed outside interactive recovery.
4. Replace raw text framework detection with structured TOML/uv parsing.
5. Validate runtime image repo env configuration.
6. Resolve GPU pricing policy mismatch between implementation and ledger spec.
7. Collapse dependency selection to one canonical field.
8. Centralize storage key builders.
9. Centralize or require environment `dataId`.
10. Consolidate defaults and URL/env var ownership.

## Validation Expectations For Follow-Up Fixes

Use affected-subrepo validation only:

- CLI changes: `make validate-cli`
- Warden changes: `make validate-warden`
- Frontend/Convex changes: `cd web && bun run lint`
- Frontend class guard: `rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'`

Tests should only be added or run when explicitly requested, except where the
repo validation command already includes tests.
