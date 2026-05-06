# Tahuna OSS Boundary

Last reviewed: 2026-05-07

## Current State

There is no separate OSS package in the current repository. The working product is the hosted Tahuna app with:

- Next.js web app.
- Convex backend.
- Go CLI.
- Go Warden runtime.
- Runpod compute.
- R2-compatible object storage.
- Hosted billing and provider credential management.

## Portable Parts Today

The most portable parts are:

- CLI command behavior.
- Runtime Warden behavior.
- Project config and sync manifest format.
- Run and serve lifecycle status names.
- Storage key helpers.
- Bootstrap plan shape.

## Hosted Parts Today

Hosted-only parts are:

- Convex Auth and Better Auth session flow.
- Convex data model and HTTP router.
- Runpod credential storage UI.
- Credits ledger and usage events.
- Cloud dashboard providers/billing views.

## Invariants

- Current specs describe the hosted implementation.
- Do not treat this file as OSS extraction guidance.
- If an OSS split happens later, document the implemented split after it exists.
