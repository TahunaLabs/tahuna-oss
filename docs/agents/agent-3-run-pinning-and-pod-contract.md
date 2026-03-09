# Agent 3 - Run Pinning + Pod Fetch Contract

## Mission
Pin manifest versions onto runs and define/implement the provisioning handoff so pods pull from R2 by manifest hash.

## Read First
- `/Users/pazuzzu/Desktop/gigi/boob-ai/docs/specs/sync-incremental-0.1.0-spec.md`
- `/Users/pazuzzu/Desktop/gigi/boob-ai/web/convex/runs.ts`
- `/Users/pazuzzu/Desktop/gigi/boob-ai/PROJECT_CONTEXT.md`

## Scope
1. On run creation, copy environment latest manifest pointers into run record.
2. Ensure run API responses expose pinned manifest hashes.
3. Update provisioning payload/contract (where currently simulated) to include pinned hashes.
4. Document pod startup expectations in project docs.

## Constraints
- Current provisioning is simulated; keep simulation behavior intact while extending payload/metadata.
- Do not block run creation if manifest pointer policy is still transitional; if enforcing, return explicit actionable errors.

## Done Criteria
- Every new run has pinned `codeManifestHash`/`dataManifestHash` when available.
- Run details expose pinned values for traceability.
- Contract for pod-side fetch is explicit and documented.

## Suggested Validation
- Create environment + sync + run.
- Verify run record includes pinned hashes and remains stable even after later syncs.
