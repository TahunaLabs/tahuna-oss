# Cloudflare Pages Deployment Guide

## Problem Description

Static assets (`/_next/static/chunks/*.js`, CSS, fonts) return 404 errors on the deployed site (`tahuna.app` and `tahuna.pages.dev`). The HTML loads, but the page is unstyled and non-functional because the browser cannot find the JavaScript bundles.

## Root Cause

1.  **Worker Interception**: By default, when a `_worker.js` is deployed to Cloudflare Pages, it intercepts **every single request**, including static assets. The worker is designed for server-side rendering (SSR) and API routes, not for serving static files directly from the file system.
2.  **Missing Routing Config**: Without a `_routes.json` file, Cloudflare Pages does not know to bypass the worker for static paths like `/_next/static/*`.
3.  **Asset Path Mismatch**: `@opennextjs/cloudflare` outputs static files to `.open-next/assets/_next`, but the worker expects them at the root `/_next`.

## Solution

Deploy the entire `.open-next` directory with the following configuration:

### 1. Directory Structure

The deployment directory (`.open-next`) must contain:
- `_worker.js` (copied from `worker.js`)
- `_next/` (copied from `assets/_next`)
- `_routes.json` (manual creation)
- All other worker dependencies (`.build`, `cloudflare`, `middleware`, `server-functions`, etc.)

### 2. `_routes.json` Configuration

Create a `_routes.json` file at the root of the deployment directory to tell Cloudflare which paths to serve directly from storage (bypassing the worker):

```json
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/_next/static/*", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]
}
```

### 3. Deployment Command

Run from the `.open-next` directory:

```bash
# 1. Rename worker to _worker.js (Cloudflare convention)
cp worker.js _worker.js

# 2. Copy static assets to root so they are served directly
cp -r assets/_next _next

# 3. Create _routes.json
cat > _routes.json << 'EOF'
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/_next/static/*", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]
}
EOF

# 4. Deploy with bundling enabled
wrangler pages deploy . \
  --project-name tahuna \
  --branch main \
  --commit-hash <commit-sha> \
  --bundle
```

**Note**: The `--bundle` flag is required so that esbuild can resolve the relative imports in `_worker.js` (e.g., `./cloudflare/images.js`, `./server-functions/default/handler.mjs`).

## Project Configuration

Ensure the Cloudflare Pages project has the following settings:

- **Compatibility Date**: `2026-05-18` (or later)
- **Compatibility Flags**: `nodejs_compat` (required for Next.js 16+ and Node.js built-ins)

## CI/CD Workflow

The GitHub Actions workflow (`.github/workflows/cloudflare-pages-deploy.yml`) implements this fix:

```yaml
- name: Deploy frontend
  working-directory: web/.open-next
  run: |
    set -e
    cp worker.js _worker.js
    cp -r assets/_next _next
    cat > _routes.json << 'EOF'
    {
      "version": 1,
      "include": ["/*"],
      "exclude": ["/_next/static/*", "/favicon.ico", "/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]
    }
    EOF
    bunx wrangler@4.92.0 pages deploy . \
      --project-name tahuna \
      --branch "${{ steps.frontend_branch.outputs.branch }}" \
      --commit-hash "${{ github.sha }}" \
      --bundle
```

## Additional Fixes Applied

- **Bun Version**: CI uses `bun@1.3.10` to match local lockfile generation.
- **Dependency Overrides**: `@better-auth/core` pinned to `1.4.19` to prevent nested resolution issues.
- **Convex Auth**: `@convex-dev/better-auth` pinned to `0.10.13` for compatibility with `better-auth@1.4.19`.
