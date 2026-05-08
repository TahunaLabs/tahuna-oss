---
name: tahuna-runtime-warden
description: Tahuna runtime and Warden implementation workflow. Use when modifying runtime/warden, runtime images, bootstrap/materialization/dependency install/training/serving/artifact sync, runtime API callbacks, or image build guardrails.
---

# Tahuna Runtime Warden

## Orientation

Use this skill with `$tahuna-repo-workflow`. Read [runtime/README.md](../../runtime/README.md), [CONTEXT.md](../../CONTEXT.md), and the relevant runtime contract before changing behavior.

Useful specs:

- [specs/python-inference-app-contract.md](../../specs/python-inference-app-contract.md)
- [specs/run-lifecycle.md](../../specs/run-lifecycle.md)
- [specs/sync.md](../../specs/sync.md)
- [specs/r2-storage-structure.md](../../specs/r2-storage-structure.md)

## Package Boundaries

Keep `cmd/warden` as thin orchestration only. Runtime concerns belong in dedicated packages:

- Runtime contract client: `internal/runtimeapi`
- Workspace and data materialization: `internal/materialize`
- Dependency install: `internal/deps` and `internal/pythonenv`
- Training execution: `internal/train`
- Serve supervision: `internal/serve`
- Bootstrap orchestration: `internal/bootstrap`
- Metrics, logs, and artifact upload behavior near the package that owns the workflow

Do not add an embedded script fallback, duplicate startup path, or parallel runtime implementation. There should be one canonical startup path.

## Runtime Contracts

Training runs receive materialized code and data, install dependencies with `uv`, execute the configured command from the workspace root, stream logs/metrics, and upload configured outputs as artifacts.

Serving runs receive materialized code, data, and a pinned model snapshot. The serve process must listen on the configured port and satisfy the configured health path. Tahuna owns lifecycle callbacks and proxy plumbing; user code owns inference semantics.

Use structured logging and detail-style errors following nearby code. Never log secrets, runtime tokens, provider credentials, signed URLs, or user env var values.

## Network And Retry Behavior

Use explicit contexts, timeouts, and retry budgets for every networked call. Centralize retry constants in shared config or environment-driven configuration rather than scattering magic numbers.

When touching sync/materialization, preserve content-addressed assumptions:

- Blobs and manifests are immutable.
- Runs pin manifest hashes at creation.
- Local output directories are excluded from local sync.
- Output artifacts are uploaded machine-to-storage after execution.

## Runtime Images

For `runtime/images/Dockerfile`, keep:

```dockerfile
UV_CACHE_DIR=/workspace/.uv-cache
```

Do not force `uv --link-mode=copy` unless explicitly requested. Keep `.github/workflows/build-templates.yml` push trigger on `develop` during MVP and preserve the inline TODO about switching back to `main` when MVP closes.

## Validation

Run from the repo root:

```bash
make validate-warden
```

This covers formatting, vetting, linting, and Go tests for the runtime.
