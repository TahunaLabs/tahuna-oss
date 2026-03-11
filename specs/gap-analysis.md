Here's the full gap analysis — spec vs implementation — organized by feature area.

---

## Auth

| Requirement | Status | Detail |
|-------------|--------|--------|
| Email OTP only | **Done** | Better Auth with emailOtp plugin, no OAuth |
| CLI-only key creation | **Done** | Only `/auth/cli` page creates keys |
| 5-minute login timeout | **Done** | `time.After(5 * time.Minute)` in CLI |
| Token resolution order | **Done** | env var -> config.env -> error |
| Max 5 active keys per user | **Done** | Count check + auto-revoke oldest in `createApiKey` |
| Max 1 key per machine | **Done** | `machineId` field + `by_user_and_machine` index; revokes existing key on same machine |
| 90-day key expiry | **Done** | Expiry check via `_creationTime + 90d` in `authByApiKey` |
| Auto-revoke oldest at limit | **Done** | Sorts active keys by `_creationTime`, revokes oldest when ≥5 |

---

## Init (`tahuna init`)

| Requirement | Status | Detail |
|-------------|--------|--------|
| No-arg defaults to `.` | **Done** | `target := "."` default |
| Re-init is error | **Done** | Checks `.tahuna/environment_id` existence |
| Entrypoint detection/scaffold | **Done** | train.py detect + template |
| Data dir detection/scaffold | **Done** | data/ detect + mkdir |
| Config detection/scaffold | **Done** | config.yaml detect + template |
| Requirements detection/scaffold | **Done** | requirements.txt detect + template |
| Output dir detection/scaffold | **Done** | `OutputDir` in `projectConfig`, detection + creation in init |
| Output dir in project.yaml | **Done** | `saveProjectConfig()` includes `output_dir` |
| Framework from requirements.txt only | **Done** | `detectFramework()` reads only `requirements.txt` |
| GPU guardrails (max count per type) | **Partial** | Validates positive int but doesn't enforce catalog max |

---

## Environments

| Requirement | Status | Detail |
|-------------|--------|--------|
| 1:1 project-env mapping | **Done** | Single `.tahuna/environment_id` |
| Always creates new on init | **Done** | Always POSTs, no lookup |
| Spec updates with validation | **Done** | `PATCH` with gpu_type/count/volume validation |
| Overridable defaults per run | **Done** | Run creation applies overrides from flags |
| Framework determines pod image | **Done** | `resolveImageName()` maps framework+version |
| Cascade delete | **Done** | Deletes all runs, events, logs, metrics; terminates active pods via `internalTerminatePod` |
| `tahuna pull` | **Future** | Not implemented (expected) |

---

## Sync

| Requirement | Status | Detail |
|-------------|--------|--------|
| Incremental content-addressed sync | **Done** | SHA256 blobs + manifest diffing |
| .gitignore respected | **Done** | Uses `git ls-files` |
| Data bundled as tar.gz | **Done** | Deterministic archive with zero timestamps |
| Manifest version history preserved | **Done** | Old manifests kept in R2 by hash |
| Missing-blob dedup | **Done** | Only uploads new blobs |
| Parallel upload workers | **Done** | 8 workers, configurable |
| Commit retry with backoff | **Done** | 8 attempts, exponential |
| Hardcoded exclusions | **Done** | Excludes `.git/`, `.tahuna/`, data dir, output dir, `node_modules/`, `__pycache__/` |
| Output dir excluded from code sync | **Done** | Output dir added to `excludeDirs` in `prepareCodeManifest` |
| Chunked/resumable upload | **Future** | Not implemented (expected) |
| Rollback to previous manifest | **Future** | Not implemented (expected) |

---

## Run Lifecycle

| Requirement | Status | Detail |
|-------------|--------|--------|
| State machine (queued->provisioning->running->completed/failed/cancelled) | **Done** | All states defined and transitioned |
| Pinned manifest hashes on run | **Done** | `codeManifestHash`/`dataManifestHash` stored |
| Preflight sync before run creation | **Done** | `syncIncremental()` called in train/run create |
| No-capacity 409 with interactive GPU fallback | **Done** | Prompts alternate GPU selection |
| Detached mode (`-d`) | **Done** | Creates run and exits |
| Artifact upload after exit 0 | **Done** | Walks `/workspace/outputs/`, uploads to R2 |
| Runtime token per run | **Done** | SHA256 hashed, validated on pod callbacks |
| Metric extraction via stdout regex | **Done** | `(\w+)=([\d.]+)` pattern |
| Graceful cancellation (SIGTERM + 30s grace) | **Done** | Bootstrap handles SIGTERM, 30s grace, force kill, artifact upload on cancel |
| `run cancel` command | **Done** | `tahuna run cancel <id>` with confirmation prompt |
| `--force` flag on cancel | **Done** | `-f`/`--force` skips confirmation |
| Cancel confirmation prompt | **Done** | Interactive yes/no before cancel |
| Pod termination on cancel | **Done** | `internalTerminatePod` calls Runpod DELETE API; scheduled from both cancel and cascade delete |
| Optional queue on no-capacity | **Future** | Workpool infrastructure exists but not user-facing |
| Periodic output sync every N seconds | **Future** | Not implemented (expected) |
| Artifact size limits per user | **Future** | Hardcoded limits exist, not per-user configurable |
| wandb-compatible SDK | **Future** | Regex fallback done, SDK not built |

---

## Pod Bootstrap

| Requirement | Status | Detail |
|-------------|--------|--------|
| Bootstrap script injected in pod | **Done** | Embedded Python via env vars |
| Code/data materialization with hash verification | **Done** | SHA256 check per file |
| Dependency install | **Done** | `pip install -r requirements.txt` |
| Status reporting to backend | **Done** | POST runtime/status |
| Log streaming to backend | **Done** | POST runtime/logs |
| Graceful SIGTERM handling | **Done** | `handle_sigterm()` + 30s grace period + force kill; reports `cancelled` status |
| **uv replaces pip** | **Done** | `ensure_uv()` installs uv if needed; `uv pip install --system -r requirements.txt` replaces pip |
| **Network restricted by default** | **Missing** | No network policy on pod creation |
| **Periodic output sync** | **Missing** | Artifacts only uploaded at end |
| **Pod termination on sync stop** | **Missing** | No heartbeat/liveness mechanism |
| Custom Docker images | **Future** | Only catalog images supported |

---

## Dashboard

| Requirement | Status | Detail |
|-------------|--------|--------|
| Create/delete environments | **Done** | Dashboard UI with Convex mutations |
| Create/cancel runs | **Done** | Launch + remove via dashboard |
| Upload data to R2 | **Done** | Presigned URL upload flow |
| Browse + download artifacts | **Done** | Table view with download buttons |
| Delete artifacts | **Done** | Remove mutation |
| **Real-time streaming** | **Missing** | No run detail page; `useQuery` is reactive but no dedicated logs/metrics view |
| **Artifact rename** | **Missing** | No rename UI or backend |
| Cross-env data binding | **Future** | Not implemented (expected) |

---

## CLI UX

| Requirement | Status | Detail |
|-------------|--------|--------|
| `-v` / `--verbose` | **Done** | On most commands |
| `-d` / `--detached` | **Done** | On train/run create |
| `-n` for line count | **Done** | On run list |
| `-a` for all | **Done** | On run list |
| Human-readable tables | **Done** | `fmt.Printf` formatted output |
| `tahuna shell` REPL | **Done** | Prompt loop with command dispatch |
| `-f` / `--follow` on logs | **Done** | `tahuna run logs <id> -f` polls every 2s, stops on terminal status |
| `-n` on `run logs` | **Done** | `maxLines` truncation in `printRunLogsSummary` |
| Error message mapping | **Done** | `friendlyError()` maps 401/403/404/409/5xx to user-friendly messages |
| Friendly errors (raw on -v) | **Done** | Friendly by default, raw error on verbose |

---

## Action Plan Priority

### P0 — Broken contract (spec says X, code does Y) — ✅ ALL DONE

1. ~~Cascade delete on environment~~ ✅
2. ~~Output dir~~ ✅
3. ~~Framework detection~~ ✅
4. ~~`run cancel` vs `run delete`~~ ✅
5. ~~Hardcoded sync exclusions~~ ✅

### P1 — Missing core features — ✅ ALL DONE (except #11 deferred)

6. ~~API key limits (5/user, 1/machine, 90-day expiry, auto-revoke)~~ ✅
7. ~~Graceful cancellation (SIGTERM + 30s grace in bootstrap)~~ ✅
8. ~~Error message mapping in CLI (401/409/etc -> friendly messages)~~ ✅
9. ~~`run logs -f` follow mode~~ ✅
10. ~~`run logs -n N` line limit~~ ✅
11. Dashboard real-time streaming — **Deferred to P2** (Convex `useQuery` is already reactive; gap is a run detail page)

### P2 — Future features (acknowledged in spec)

12. ~~uv replaces pip~~ ✅
13. Periodic output dir sync
14. Pod network isolation
15. Chunked/resumable upload
16. Sync rollback
17. Optional capacity queue
18. wandb-compatible SDK
19. Custom Docker images
20. Cross-env data binding
21. Artifact rename in dashboard
22. `tahuna pull`
23. Per-user artifact size limits
24. Dashboard run detail page with real-time logs/metrics (moved from P1-11)
