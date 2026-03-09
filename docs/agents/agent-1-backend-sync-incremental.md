# Agent 1 - Backend Incremental Sync (0.1.0) (Convex)

## Mission
Implement Incremental Sync (0.1.0) backend APIs and schema support for incremental blob + manifest sync.

## Read First
- `/Users/pazuzzu/Desktop/gigi/boob-ai/docs/specs/sync-incremental-0.1.0-spec.md`
- `/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/schema.ts`
- `/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/cli.ts`
- `/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/http.ts`

## Scope
1. Add schema fields in `environments` and `runs` for manifest hashes.
2. Add HTTP actions:
- `POST /api/sync/blobs/missing`
- `POST /api/sync/blobs/upload-url`
- `POST /api/sync/manifests/upload-url`
- `POST /api/sync/commit`
3. Add route wiring in `web/convex/http.ts`.
4. Keep existing auth/ownership constraints.
5. Ensure key prefixes are user-scoped and type-scoped (`code` vs `data`).

## Constraints
- Do not break existing `/api/sync/code/upload-url` and `/api/sync/data/upload-url` yet.
- Use Convex validators for args/returns where applicable.

## Done Criteria
- New endpoints compile and return expected payloads.
- Environment sync pointers update on commit only if manifests exist.
- Existing endpoints still function.

## Suggested Validation
- `cd /Users/pazuzzu/Desktop/gigi/boob-ai/web && bun run convex:dev` (or project standard checks)
- Hit endpoints with sample payloads and validate auth + ownership errors.
