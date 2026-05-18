# Cloudflare Deployment Troubleshooting

## Bootstrap Workflow

| Problem | Fix |
|---------|-----|
| `wrangler pages project create` fails when project already exists | Use `\|\| true` instead of existence-check-then-create |
| R2 bucket creation fails with `--jurisdiction` + `--location` together | Remove `--jurisdiction`, keep `--location weur` only |
| Missing `nodejs_compat` flag on project creation | Add `--compatibility-flag nodejs_compat` to `wrangler pages project create` |

## Frontend Deploy

| Problem | Fix |
|---------|-----|
| `@cloudflare/next-on-pages` requires `export const runtime = 'edge'` on every route | Switch to `@opennextjs/cloudflare` (`bun run pages:build`) |
| Deploying `.vercel/output/static` — no server functions | Deploy `.open-next/` (full directory from opennextjs-cloudflare) |
| `wrangler pages deploy` can't resolve Node builtins (`fs`, `path`, etc.) | Copy `worker.js` → `_worker.js` before deploy; project must have `nodejs_compat` flag |
| Deploy command doesn't accept `--compatibility-flags` | Set flag on project creation, not at deploy time |

## Git Integration Conflict

| Problem | Fix |
|---------|-----|
| Cloudflare Pages auto-builds with wrong settings (old `next-on-pages` pattern) | Disconnect Git integration in Cloudflare dashboard; use GitHub Actions only |
| Dashboard "Disconnect repository" not visible | Delete project → re-run bootstrap (creates without Git integration) |

## Custom Domains

| Problem | Fix |
|---------|-----|
| Dashboard "Activate Domain" gives auth error | Use API directly: `curl -X POST` to `/pages/projects/:project/domains` |
| `wrangler pages project domain add` command doesn't exist in v4.92 | Domain management not available via wrangler CLI; use dashboard or API |
| DNS verification stuck on "Verifying" | Enter `@` in Name field → click "Check DNS records" (Cloudflare auto-creates CNAME with flattening) |

## Branch Merge Conflicts

| Problem | Cause |
|---------|-------|
| `main` → `develop` merge conflicts on `package.json`, workflows, `wrangler.jsonc` | Both branches diverged from same point with independent changes to same files |

**Resolution:** Keep `main` versions (opennextjs-cloudflare pipeline with `nodejs_compat`). Use `git checkout --theirs <file>` when `main` should win.
