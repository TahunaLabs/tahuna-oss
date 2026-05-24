---
name: ci-conventions
description: Reference for CI/CD conventions in this repo. Use when writing or reviewing GitHub Actions workflows, managing secrets/vars, or setting up environments.
---

# CI Conventions

## Workflow files

- Name: `verb-noun.yml` — `deploy-site`, `deploy-backend`, `build-images`, `bootstrap`
- One concern per file, one deployment target per file
- Path filters: each workflow only triggers on paths it owns
- Use `github.ref_name` for branch comparisons; `github.ref` only for concurrency group keys

## Branch → environment mapping

| Branch | GitHub environment | Convex deployment |
|---|---|---|
| `main` | `production` / `docs-production` | `pazuzzu:tahuna:production` |
| `develop` | `staging` / `docs-staging` | `pazuzzu:tahuna:staging` |

Environment selection pattern:
```yaml
environment: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
```

## Where each var lives

| Var type | Where |
|---|---|
| `NEXT_PUBLIC_*` (build-time, Next.js) | GitHub environment vars |
| Cloudflare infra (`CLOUDFLARE_ACCOUNT_ID`) | GitHub repo vars |
| Cloudflare auth (`CLOUDFLARE_API_TOKEN`) | GitHub repo secrets |
| App secrets (`STRIPE_*`, OAuth, RunPod, `SITE_URL`) | Convex dashboard only |
| `CONVEX_DEPLOY_KEY` | GitHub environment secrets |

**Never** put app secrets in GitHub or Cloudflare. **Never** put `NEXT_PUBLIC_*` in `wrangler.jsonc` — they are build-time only and must be injected during the GitHub Actions build step.

## Rules

- No fallback chains on env vars — crash if missing
- `bun` everywhere, never `npm`; always `--frozen-lockfile` in CI
- Staging uses Stripe test keys, never live keys
- `develop` = staging; no separate staging branch
- `wrangler.jsonc` holds only static Cloudflare Worker config — no vars
- GitHub environment branch rules enforce which branch can deploy to which environment — don't duplicate that logic in workflow conditions beyond the environment selector
