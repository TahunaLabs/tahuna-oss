# Agent 2 - CLI Incremental Sync (0.1.0) Engine

## Mission
Replace tarball-first sync path with manifest/blob incremental sync in the Go CLI, and add manual `sync` commands.

## Read First
- `/Users/pazuzzu/Desktop/gigi/boob-ai/docs/specs/sync-incremental-0.1.0-spec.md`
- `/Users/pazuzzu/Desktop/gigi/boob-ai/cli/main.go`

## Scope
1. Add commands:
- `tahuna sync`
- `tahuna sync code`
- `tahuna sync data`
2. Implement manifest generation for code and data:
- file path, sha256, size, mode
- stable sorted entries
- manifest hash
3. Implement blob missing-check + upload flow against new backend endpoints.
4. Upload manifest JSON and commit sync pointers.
5. Make `train` and `run create` use new sync engine as preflight.

## Constraints
- Keep existing auth/base URL behavior unchanged.
- Preserve current linked environment resolution.
- Keep old sync functions only if needed for temporary compatibility; default path should be incremental sync.

## Done Criteria
- First sync uploads blobs/manifests.
- Second sync with no changes uploads nothing.
- File change uploads only changed blob(s) and new manifest.
- `train` and `run create` still work and call sync preflight.

## Suggested Validation
- `cd /Users/pazuzzu/Desktop/gigi/boob-ai/cli && go test ./...` (if tests exist)
- Manual smoke:
  - `go run . sync`
  - `go run . train -d`
