# Agent Prompt

## General (Mandatory)

- Execute tasks in agreed order. One logical unit per commit.
- Change code only when the user explicitly asks for implementation.
- Discussion-first default: if the user asks a question like "can you make sure ...?", treat it as analysis/discussion and do not edit files unless the user explicitly asks to proceed with code changes.
- For every change: check if it's in linear, if it does ask user to update it if not log to Linear (issue, recommendation, commit hash, validation commands) using the Linear tool.
- For any Linear issue the agent creates or updates, set `delegate` to the agent's own name and include a short signature line (`Agent: <agent-name>`) in the issue body or update comment.
- Linear state hygiene is mandatory:
  - Do not leave shipped work in `Backlog`/`Todo`.
  - Before final handoff, update the issue state to `Done` (or the team's terminal state), add the pushed commit hash, and list validation commands/results in a final comment.
  - When reporting "next tasks", use state-filtered Linear queries (`Todo`, `Backlog`, etc.), not only `updatedAt`.
  - Do not infer active work from `gitBranchName` alone.
- No backward-compat layers unless requested.
- Keep names canonical across layers: when a domain term changes, update command surface, help text, API paths, internal symbols, errors, tests, and docs in the same change.
- No stale terminology: do not leave old names in variables/functions/comments/errors once the canonical term is changed.
- Before commit, run a consistency grep for renamed terms and fix remaining hits in touched areas.
- Validate before commit: `bun run lint` (ESLint + TypeScript unused checks).
- For Go CLI changes, validate with `make validate-cli` before commit.
- Runtime image CI guardrail: keep `.github/workflows/build-templates.yml` push trigger on `develop` during MVP; switch back to `main` when MVP is closed (and keep an inline TODO reminder in the workflow file).
- **If guardrails conflict or intent is ambiguous: stop and ask before touching any code.**
- Tests only when explicitly requested.

## Consistency (All Sections)

- Match the ethos, structure, naming, and error style of surrounding code in every file you touch.
- One canonical implementation per concern — delete duplicate/legacy paths.
- No ad-hoc patterns (logging, errors, imports, state shape) that diverge from what's already established.
- Before introducing a new pattern, check whether an existing one already covers it.

## Frontend (`web/` outside `web/convex/**`)

- Search the whole monorepo before deleting or rewriting; usage may live outside `web/`.
- Remove dead UI, duplicate helpers, and legacy flows once forward path is confirmed.
- Keep presentation separate from data/mutation orchestration. Extract repeated view logic into focused components.
- One canonical path per screen state (loading/empty/success/error). No duplicate client state derivable from fetched data.
- One component per file by default, keep component structure/naming consistent across usages, and only allow multi-component files for shadcn primitives in `web/components/ui/**`.
- Preserve existing naming, copy tone, and interaction patterns. Reuse shared primitives before introducing variants.
- Use shadcn/ui components when available; create a local shadcn-style component if the primitive doesn't exist yet.
- Keep `web/app/globals.css` for tokens (`:root` + `@theme inline`) and base styles only; do not add feature/layout classes there.
- Do not add new BEM/global layout classes (for example `.foo__bar`, `.dashboard-*`) without explicit approval.
- Do not add arbitrary Tailwind values (`text-[...]`, `rounded-[...]`, `grid-cols-[...]`, etc.) without explicit approval.
- Reuse semantic token utilities for type/spacing/radius/font; avoid explicit px values when a token utility exists.
- If a class pattern is reused 3+ times, extract it into a shared `cva` variant or primitive.
- Refactors must be net simplification (added lines/indirection should not exceed removed).
- Frontend validation before commit:
  - `bun run lint` (in `web/`)
  - `rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'`

## Convex (`web/convex/**`)

- Never modify `web/convex/auth.ts`.
- Before marking anything unused, check both `web/` and `cli/`. Ignore `web/convex/_generated/`.
- No heavy fanout or object-store work in `query` — move to `action`. No N+1 lookups. No silent list caps; return explicit pagination metadata.
- Absolute imports only (`@convex/*`, `@/*`). Consistent DTO keys (e.g. `environment_id`). Structured errors (`detail`-style) only.

## Go CLI (`cli/`)

- Search whole repo before removing or renaming anything.
- Validate every commit with `make validate-cli` (`gofmt`, `go vet`, `golangci-lint`, `go test`).
- Command parsing/output → command files. HTTP helpers → `ui_api.go`. Project state → `project.go`. Sync internals → `sync.go`.
- One canonical flag spelling. Human-readable default output; JSON only under `--verbose`.
- Use one canonical subcommand verb per action across command families (for example: `rm` for removal). Do not keep alias verbs unless explicitly requested.
- For shared flags, expose both short and long forms consistently (for example: `-a` and `--all`) across equivalent commands.
- Every command group (`run`, `env`, `data`, `gpus`, etc.) must support `-h`, `--help`, and `help`, and unknown/missing subcommands must print that group's usage.
- Keep per-subcommand FlagSets isolated so `... <group> <subcommand> -h` only shows flags for that subcommand.
- Explicit timeouts/contexts for all networked calls. One canonical error/output style per command family.
- **CLI tests:** use `httptest.NewServer` mock servers (not pure unit mocks). Shared helpers live in `test_helpers_test.go` — reuse before adding new ones. Flags must come before positional args in test calls (Go `flag` stops at first non-flag). Functions using `must()`/`require()` call `os.Exit` — cannot be tested for failure via `recover()`; test the underlying function that returns an error instead. Interactive prompts (`promptChoice`, `promptInt`) need a real terminal — test non-interactive (flag-based) paths only unless prompt functions are refactored to accept injected IO.

## Go Runtime (`runtime/warden/`)

- Search whole repo before removing or renaming any runtime contract references.
- Validate every commit with `make validate-warden` (`gofmt`, `go vet`, `golangci-lint`, `go test`).
- Runtime dependency install convention: set `UV_CACHE_DIR=/workspace/.uv-cache` in `runtime/images/Dockerfile`; keep uv default link behavior (Linux hardlink with fallback). Do not force `--link-mode=copy` unless explicitly requested.
- Runtime contract client, workspace materialization, dependency install, training execution, metrics extraction, and artifact sync each live in dedicated packages. Keep `cmd/warden` as thin orchestration only.
- One canonical startup path only. No embedded script fallback or duplicate runtime implementations.
- Explicit contexts/timeouts/retry budgets for all networked calls. Keep retry constants centralized and sourced from shared config/env (no hardcoded magic numbers in flow logic).
- Structured logging and `detail`-style errors only. Never log secrets (runtime token, signed URLs, auth headers).
