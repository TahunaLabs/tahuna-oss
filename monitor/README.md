# Tahuna Monitor SDK (MVP)

Minimal W&B-compatible tracking SDK for Tahuna runtime pods.

## Scope

- Import contract: `import tahuna.monitor as wandb`
- Compatibility shim: plain `import wandb` is supported and routes to Tahuna monitor MVP APIs
- Supported API: `wandb.init()`, `wandb.log()`, `wandb.finish()`, `wandb.config`
- Transport: runtime callbacks to existing Tahuna endpoints:
  - `POST /api/runs/{run_id}/runtime/logs`
  - `POST /api/runs/{run_id}/runtime/metrics`
- No fallback paths: requires `TAHUNA_API_BASE`, `TAHUNA_RUN_ID`, `TAHUNA_RUNTIME_TOKEN`

## Upstream W&B Prune (Required Step)

Source clone (shallow):

```bash
git clone --depth 1 --filter=blob:none https://github.com/wandb/wandb.git /tmp/wandb-upstream
```

Pruned hard to only API-reference files related to `init/log/finish/config` plus license docs:

- Kept:
  - `LICENSE`
  - `README.md`
  - `wandb/__init__.py`
  - `wandb/sdk/__init__.py`
  - `wandb/sdk/wandb_init.py`
  - `wandb/sdk/wandb_run.py`
- Removed:
  - Everything else in upstream repository

Pruned snapshot is vendored at `monitor/third_party/wandb-pruned/`.

## Security

- Secret-like keys are dropped (`token`, `secret`, `password`, `api_key`, etc.).
- Signed URLs are redacted from emitted event messages.
- Only numeric values are accepted for metrics.
