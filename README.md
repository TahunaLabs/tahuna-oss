# Tahuna

Tahuna is a monorepo for GPU provisioning and ML training orchestration.

## Subrepos

- [`cli/README.md`](cli/README.md): Go CLI used by end users (`tahuna login/init/train/run/sync`).
- [`web/README.md`](web/README.md): Next.js + Convex app and API surface.
- [`runtime/README.md`](runtime/README.md): in-pod runtime (`warden`) and image build assets.

## Project context

- [`CONTEXT.md`](CONTEXT.md): current product status, architecture, and decisions.
- [`PROMPT.md`](PROMPT.md): repo guardrails and implementation constraints.

## Quick local dev

```bash
make install-web
make install-cli
make run-web
make run-cli
```

## Self-hosting

The supported self-hosting recipe runs the current web app with a self-hosted
Convex backend. See [`docker/README.md`](docker/README.md) for requirements,
security boundaries, and setup instructions.
