# Tahuna

Tahuna is a monorepo for GPU provisioning and ML training orchestration.

## Subrepos

- [`cli/README.md`](/Users/pazuzzu/Desktop/gigi/boob-ai/cli/README.md): Go CLI used by end users (`tahuna login/init/train/run/sync`).
- [`web/README.md`](/Users/pazuzzu/Desktop/gigi/boob-ai/web/README.md): Next.js + Convex app and API surface.
- [`runtime/README.md`](/Users/pazuzzu/Desktop/gigi/boob-ai/runtime/README.md): in-pod runtime (`warden`) and image build assets.

## Project context

- [`CONTEXT.md`](/Users/pazuzzu/Desktop/gigi/boob-ai/CONTEXT.md): current product status, architecture, and decisions.
- [`PROMPT.md`](/Users/pazuzzu/Desktop/gigi/boob-ai/PROMPT.md): repo guardrails and implementation constraints.

## Quick local dev

```bash
make install-web
make install-cli
make run-web
make run-cli
```
