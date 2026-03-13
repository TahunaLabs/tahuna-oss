Good catch — that's a cross-cutting principle. Here's the full updated prompt with a **Consistency (All Sections)** rule added:

---

# Agent Prompt

## General (Mandatory)

- Execute tasks in agreed order. One logical unit per commit.
- For every change: log to Linear (issue, recommendation, commit hash, validation commands) using the Linear tool.
- Validate before commit: `bun run lint` (ESLint + TypeScript unused checks).
- For Go CLI changes, validate with `make validate-cli` before commit.
- **If guardrails conflict or intent is ambiguous: stop and ask before touching any code.**
- Tests only when explicitly requested.

## Consistency (All Sections)

- Match the ethos, structure, naming, and error style of surrounding code in every file you touch.
- One canonical implementation per concern — delete duplicate/legacy paths.
- No ad-hoc patterns (logging, errors, imports, state shape) that diverge from what's already established.
- Before introducing a new pattern, check whether an existing one already covers it.

## Frontend (`web/` outside `web/convex/**`)

- Search the whole monorepo before deleting or rewriting; usage may live outside `web/`.
- Remove dead UI, duplicate helpers, and legacy flows once forward path is confirmed. No backward-compat layers unless requested.
- Keep presentation separate from data/mutation orchestration. Extract repeated view logic into focused components.
- One canonical path per screen state (loading/empty/success/error). No duplicate client state derivable from fetched data.
- Preserve existing naming, copy tone, and interaction patterns. Reuse shared primitives before introducing variants.

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
- Explicit timeouts/contexts for all networked calls. One canonical error/output style per command family.