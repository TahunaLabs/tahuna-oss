---
name: tahuna-web-convex
description: Tahuna web and Convex implementation workflow. Use when modifying the Next.js app, dashboard components, API routes, Convex schema/functions, frontend styling, React state, or browser-facing Tahuna behavior under web/ or web/convex/.
---

# Tahuna Web Convex

## Orientation

Use this skill with `$tahuna-repo-workflow`. Read [web/README.md](../../web/README.md), [CONTEXT.md](../../CONTEXT.md), and the relevant spec before changing behavior.

Key boundaries:

- `web/` is the Next.js app, dashboard, API routes, and shared frontend libraries.
- `web/convex/**` is backend state, CLI-facing HTTP handlers, run lifecycle, serve lifecycle, and data/sync logic.
- Never modify `web/convex/auth.ts`.

## Frontend Shape

Keep route/page components thin. A page should route and lay out shell structure only. Data fetching, mutations, local state, and handlers belong in a dedicated container component colocated with the view it drives.

Separate presentation from orchestration:

- Presentational components receive data and callbacks.
- Container components own queries, mutations, derived view state, and event handlers.
- Loading, empty, success, and error states should have one canonical path each.

Use one component per file by default. Multi-component files are reserved for shadcn primitives under `web/components/ui/**`.

## React Hooks

Prefer derived values over stored state.

Before adding `useState`, check whether the value can be computed from props, query results, or existing state. Before adding `useEffect`, check whether the trigger can be handled at the event source. Before adding `useMemo`, require either expensive computation or downstream reference stability.

Legitimate `useEffect` uses include async data arrival, debounced network calls, and syncing with external systems. Do not use effects to reset derived state or cascade one state update into another.

## Styling

Reuse existing shadcn/ui primitives and local Tahuna interaction patterns. Preserve copy tone and visual density.

Do not add new BEM/global layout classes to `web/app/globals.css`; it is for tokens, `@theme inline`, and base styles. Avoid arbitrary Tailwind values such as `text-[...]`, `leading-[...]`, `tracking-[...]`, `rounded-[...]`, and `grid-cols-[...]` without explicit approval.

When a class pattern repeats three or more times, extract a `cva` variant if it matches local component style.

## Convex Rules

Before marking Convex code unused, check both `web/` and `cli/`, ignoring `web/convex/_generated/`.

Use absolute imports only:

```ts
import { something } from "@convex/..."
import { somethingElse } from "@/..."
```

Keep query work lightweight. Move heavy fanout, object-store work, and external calls to actions. Avoid N+1 lookups and silent list caps; return explicit pagination metadata when lists can grow.

Use consistent DTO keys such as `environment_id` at API boundaries and detail-style structured errors where existing code does.

## CLI/API Contracts

When touching CLI-facing API routes, inspect both sides:

- `web/convex/http.ts`
- `web/convex/cli.ts`
- `web/convex/runs.ts`
- `web/convex/serves.ts`
- `web/convex/servesRead.ts`
- `cli/main.go`

Keep canonical paths and payload keys aligned. Do not leave compatibility aliases unless explicitly requested.

## Validation

For frontend changes outside `web/convex/**`, run:

```bash
cd web && bun run lint
rg -n "text-\\[|leading-\\[|tracking-\\[|rounded-\\[|grid-cols-\\[" web --glob '!web/convex/**'
```

For Convex-only changes, run the smallest local validation that exercises the touched API when available, and still run `cd web && bun run lint` if TypeScript or imports are affected.
