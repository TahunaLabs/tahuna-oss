---
name: tahuna-repo-workflow
description: Tahuna repository change workflow for Codex agents. Use when planning, implementing, validating, committing, or handing off any change in the Tahuna monorepo, especially when Linear tracking, canonical terminology, subsystem validation, or AGENTS.md guardrails matter.
---

# Tahuna Repo Workflow

## Start Here

Use this skill as the first pass for Tahuna repository work. Treat [AGENTS.md](../../AGENTS.md) as the highest-priority repo-local contract and read the subsystem skill after this one when the requested change touches `web/`, `web/convex/`, `cli/`, or `runtime/warden/`.

Before changing files:

1. Run `git status --short` and preserve unrelated user changes.
2. Search Linear for an existing issue that matches the work.
3. If no issue exists, create one in the `Tahuna` team with `Agent: Codex`, `delegate: Codex`, the recommendation, planned validation, and commit hash as `TBD`.
4. If an issue exists and the requested work is not already represented there, ask the user to update it before editing.
5. Read [CONTEXT.md](../../CONTEXT.md) for current architecture and current product state when behavior or naming is unclear.

## Change Discipline

Keep each change one logical unit. Do not add backward-compatibility aliases, duplicate paths, stale names, or parallel implementations unless the user explicitly asks.

When renaming or changing terminology, grep the whole repository and make the command surface, API paths, symbols, errors, and docs use the same canonical term in the same change.

When removing or rewriting behavior, search the whole monorepo first. Usage may live outside the subtree being edited.

Do not create, move, or push Git tags unless the user explicitly asks for tagging in the current thread.

## Subsystem Routing

Use these subsystem skills when relevant:

- `$tahuna-web-convex` for `web/` and `web/convex/**`.
- `$tahuna-go-cli` for `cli/`.
- `$tahuna-runtime-warden` for `runtime/warden/` or runtime image work.
- `$tahuna-user-workflows` when the task is about using Tahuna as an end user or preserving the product contract across CLI, web, and runtime.

## Validation

Run only the validation required by the touched subtree unless the user asks for broader validation:

- Frontend outside `web/convex/**`: `cd web && bun run lint`
- Frontend Tailwind guardrail: `rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'`
- Go CLI: `make validate-cli`
- Go runtime: `make validate-warden`
- Skills: `python3 /Users/mounselam/.codex/skills/.system/skill-creator/scripts/quick_validate.py <skill-dir>`

Do not add tests unless the user explicitly asks. Existing validation commands may still run tests when they are part of the repo-required validation target.

## Handoff

Before handoff:

1. Commit the logical unit.
2. Add a final Linear comment with `Agent: Codex`, the commit hash, files changed at a high level, and validation commands/results.
3. Set the Linear issue state to `Done` once shipped work is complete.
4. Report any validation that could not be run and why.
