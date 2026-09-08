# Agent Prompt

## General (Mandatory)

- Execute tasks in agreed order. One logical unit per commit.
- Change code only when the user explicitly asks for implementation. Discussion-first default: treat "can you make sure…?" as analysis — do not edit files until explicitly asked.
- Never create, move, or push Git tags unless the user explicitly asks for tagging in the current thread.
- For every change: search Linear first; if an issue exists ask the user to update it, otherwise log to Linear (issue, recommendation, commit hash, validation commands) using the Linear tool.
- For any Linear issue created or updated: set `delegate` to the agent's own name and include `Agent: <agent-name>` in the body or update comment.
- Linear state hygiene: do not leave shipped work in `Backlog`/`Todo`; before handoff set state to `Done`, add commit hash, list validation commands/results in a final comment; use state-filtered queries when reporting next tasks; do not infer active work from `gitBranchName` alone.
- No backward-compat layers unless requested. Keep names canonical across layers (command surface, API paths, symbols, errors, docs) in the same change. No stale terminology once a term is renamed; grep for remaining hits before committing.
- Validate before commit in the affected subrepo(s): for frontend changes run `cd web && bun run lint` (ESLint + TypeScript unused checks); for Go CLI run `make validate-cli`; for Go Runtime run `make validate-warden`.
- Runtime image CI guardrail: keep `.github/workflows/build-templates.yml` push trigger on `develop` during MVP; switch back to `main` when MVP closes (keep inline TODO).
- **If guardrails conflict or intent is ambiguous: stop and ask before touching any code.**
- Tests only when explicitly requested.

## Consistency (All Sections)

- Match the ethos, structure, naming, and error style of surrounding code in every file touched.
- One canonical implementation per concern — delete duplicate/legacy paths.
- No ad-hoc patterns (logging, errors, imports, state shape) that diverge from what's already established. Check for an existing pattern before introducing a new one.

## Frontend (`web/` outside `web/convex/**`)

- Search the whole monorepo before deleting or rewriting; usage may live outside `web/`.
- **Single responsibility:** each component owns exactly one concern. A page/route component is a thin router + layout shell only — no state, queries, or handlers beyond what the shell itself needs. Data fetching, mutation handling, and local state belong in a dedicated container component colocated with the view it drives. When a component starts mixing concerns, extract before adding more.
- **React hooks (React 19):** prefer deriving values over storing them. Before adding `useState`, ask if the value is computable from existing state/props — if yes, compute inline. Before adding `useEffect`, ask if the trigger can be an event handler instead — if yes, move it there. Before adding `useMemo`, ask if the computation is genuinely expensive or if reference stability is required by a downstream hook — if neither, compute inline. Legitimate `useEffect` uses: reacting to async data arrival, debouncing network calls, syncing with external systems. Never use `useEffect` to reset derived state or to cascade one state update into another.
- Keep presentation separate from data/mutation orchestration.
- One canonical path per screen state (loading/empty/success/error). No duplicate client state derivable from fetched data.
- One component per file by default; multi-component files only for shadcn primitives in `web/components/ui/**`.
- Preserve existing naming, copy tone, and interaction patterns. Reuse shared primitives before introducing variants. Use shadcn/ui components when available; create a local shadcn-style component if the primitive doesn't exist.
- Keep `web/app/globals.css` for tokens (`:root` + `@theme inline`) and base styles only. No new BEM/global layout classes without explicit approval. No arbitrary Tailwind values (`text-[...]`, `rounded-[...]`, etc.) without explicit approval. Reuse semantic token utilities; avoid explicit px values when a token utility exists. Extract a `cva` variant when a class pattern repeats 3+ times.
- Refactors must be net simplification (added lines/indirection must not exceed removed).
- Frontend validation before commit: `cd web && bun run lint` and `rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'`

## Convex (`web/convex/**`)

- Never modify `web/convex/auth.ts`.
- Before marking anything unused, check both `web/` and `cli/`. Ignore `web/convex/_generated/`.
- No heavy fanout or object-store work in `query` — move to `action`. No N+1 lookups. No silent list caps; return explicit pagination metadata.
- Absolute imports only (`@convex/*`, `@/*`). Consistent DTO keys (e.g. `environment_id`). Structured errors (`detail`-style) only.

## Go CLI (`cli/`)

- Search whole repo before removing or renaming anything.
- Validate every commit with `make validate-cli` (`gofmt`, `go vet`, `golangci-lint`, `go test`).
- Command parsing/output → command files. HTTP helpers → `ui_api.go`. Project state → `project.go`. Sync internals → `sync.go`.
- One canonical flag spelling. Human-readable default output; JSON only under `--verbose`. One canonical subcommand verb per action; no alias verbs unless requested. Short and long forms for shared flags (e.g. `-a`/`--all`).
- Every command group must support `-h`, `--help`, and `help`; unknown/missing subcommands print group usage. Keep per-subcommand FlagSets isolated.
- Explicit timeouts/contexts for all networked calls. One canonical error/output style per command family.
- **CLI tests:** use `httptest.NewServer` mock servers. Shared helpers live in `test_helpers_test.go`. Flags before positional args in test calls. Functions using `must()`/`require()` call `os.Exit` — test the underlying error-returning function instead. Interactive prompts need a real terminal — test non-interactive paths only.

## Go Runtime (`runtime/warden/`)

- Search whole repo before removing or renaming any runtime contract references.
- Validate every commit with `make validate-warden` (`gofmt`, `go vet`, `golangci-lint`, `go test`).
- `UV_CACHE_DIR=/workspace/.uv-cache` in `runtime/images/Dockerfile`; keep uv default link behavior. Do not force `--link-mode=copy` unless requested.
- Runtime contract client, workspace materialization, dependency install, training execution, metrics extraction, and artifact sync each live in dedicated packages. Keep `cmd/warden` as thin orchestration only.
- One canonical startup path only. No embedded script fallback or duplicate runtime implementations.
- Explicit contexts/timeouts/retry budgets for all networked calls. Retry constants centralized in shared config/env. Structured logging and `detail`-style errors only. Never log secrets.
