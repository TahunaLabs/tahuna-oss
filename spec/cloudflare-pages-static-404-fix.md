# Cloudflare Pages static asset 404 fix

## Symptoms

All `_next/static/chunks/*.js` and font files return 404 on both `tahuna.app` and `www.tahuna.app`. The HTML loads fine, but none of the JS bundles execute — the page is broken.

## Root cause

The CI was deploying the entire `.open-next` directory to Cloudflare Pages:

```yaml
cp web/.open-next/worker.js web/.open-next/_worker.js
wrangler pages deploy web/.open-next
```

With this layout, Cloudflare's ASSETS binding sees the static files at:

```
/assets/_next/static/chunks/xxx.js   ← ASSETS path
```

But the worker calls `ASSETS.fetch(rawPath)` where `rawPath` is the original request path:

```
/_next/static/chunks/xxx.js          ← what the browser and worker request
```

Path mismatch → 404 for every JS chunk and font.

## Fix

Deploy `.open-next/assets` as the root instead, and place `_worker.js` inside it:

```yaml
cp web/.open-next/worker.js web/.open-next/assets/_worker.js
wrangler pages deploy web/.open-next/assets
```

Now the files sit at ASSETS path `/_next/static/chunks/xxx.js`, which matches what the worker fetches.

This also aligns with `wrangler.jsonc`:

```json
"pages_build_output_dir": ".open-next/assets"
```

## Other fixes in the same branch (develop)

- **bun version**: bumped to `1.3.10` in all three workflow files and in `packageManager` — the lockfile generated locally was bun 1.3.10 but CI was running bun 1.1.20, causing `Outdated lockfile version` errors.
- **`@better-auth/core` resolution**: `@better-auth/passkey` was pulling in `@better-auth/core@1.6.11` (nested), which dropped the `./utils` export that Convex uses. Fixed with `overrides: { "@better-auth/core": "1.4.19" }` in `package.json`.
- **`@convex-dev/better-auth` version**: pinned to `0.10.13` — `0.10.11` is incompatible with `better-auth@1.4.19` (`createAuthEndpoint` import missing).

## To deploy

Merge `develop` → `main`. The CI triggers on push to `main` and will run `pages:build` + `wrangler pages deploy web/.open-next/assets`.
