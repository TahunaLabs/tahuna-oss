---
name: tahuna-train-project
description: User-facing Tahuna training workflow. Use when an agent is helping a Tahuna user prepare a Python project for training, validate tahuna.toml, smoke-check project readiness, sync code/data, set runtime environment variables, launch tahuna train, monitor logs/status, inspect storage/artifacts, control compute lifecycle, or troubleshoot failed training runs.
---

# Tahuna Train Project

## Goal

Help a user launch and inspect a Tahuna training run from their own project directory. Keep the workflow focused on the user's project files and Tahuna CLI commands.

Before starting a paid run, show the exact command, compute settings, expected output path, and cancel command, then ask the user to confirm.

## Preflight

Check the project state:

```bash
pwd
test -f tahuna.toml && sed -n '1,220p' tahuna.toml
test -f pyproject.toml && sed -n '1,220p' pyproject.toml
test -f .tahuna/environment_id && cat .tahuna/environment_id
```

If `tahuna.toml` or `.tahuna/environment_id` is missing, use `$tahuna-setup-hardware` first.

Verify the training command in `tahuna.toml`:

- it should run from the project root
- it should be an array of tokens, not a shell string
- it should write artifacts to the configured output directory
- it should not require secrets hardcoded in source files

Check active work before launching more compute:

```bash
tahuna run list
tahuna serve list
```

If a previous run is still active, ask whether to monitor it, cancel it, or launch another run. If a serve is no longer needed, stop it before starting more compute.

## Local Smoke Check

Prefer a fast local check before syncing:

```bash
uv run python -m py_compile train.py
```

If the project has a documented smoke-test or dry-run command, use that instead. Avoid starting a full local training run, downloading large models, or printing secrets.

Confirm the training script writes to the same output directory configured in `tahuna.toml`. If the script writes `outputs/adapter` but the config expects `outputs/model`, fix the mismatch before spending compute.

## Runtime Secrets

Use Tahuna env vars for runtime secrets such as model hub tokens:

```bash
tahuna env_vars list
tahuna env_vars set HF_TOKEN=...
tahuna env_vars set --from-file .env.local
```

Do not print secret values in logs or summaries. If using a file, inspect only the variable names unless the user explicitly asks.

Keep provider credentials out of this flow. Runpod credentials belong in the Tahuna dashboard Providers view, not in `env_vars`.

## Sync

Sync before training when the user wants to confirm what will be uploaded:

```bash
tahuna sync
```

Remember:

- `tahuna train` auto-syncs code and data before creating a run
- `tahuna sync code` uploads code only
- `tahuna sync data` uploads the configured data directory only
- local output directories are excluded from local-to-remote sync
- generated training artifacts are uploaded from the machine after the run

Use storage/data commands for existing uploaded data:

```bash
tahuna data list
tahuna data show <data_id>
```

If the data directory is huge or wrong, stop and fix `tahuna.toml` before syncing. Ensure `.gitignore` excludes local caches and large generated files that are not meant to be code.

Never sync secrets as files. Use `tahuna env_vars` for runtime secrets.

## Launch

Foreground run:

```bash
tahuna train
```

Detached run:

```bash
tahuna train -d
```

One-off compute override:

```bash
tahuna train --gpu-type "<gpu name>" --gpu-count 1 --volume-gb 80
```

Use one GPU unless the user's training code is known to support multi-GPU execution.

If the user wants to limit cost risk, start with a small smoke run or detached run on the smallest viable GPU, then scale after confirming logs and artifact output.

## Monitor

Use run commands after launch:

```bash
tahuna run list
tahuna run show <run_id>
tahuna run logs <run_id>
tahuna run watch <run_id>
```

To stop active work:

```bash
tahuna run cancel <run_id>
tahuna run cancel <run_id> --force
```

Use force only when graceful cancellation is stuck or the user accepts that artifacts may not be saved.

For debugging, gather:

- run ID
- status
- recent logs
- selected GPU/count/volume
- training command
- output directory

Do not assume a run failed just because logs are quiet during dependency install or model download. Inspect status and logs together.

## Artifacts

After completion:

```bash
tahuna run show <run_id>
```

Confirm that expected model files are present under the configured output directory and surfaced on the run. Use this path later for serving, for example:

```bash
tahuna serve create --from-run <run_id> --model-path outputs/model
```

If the run completed but expected artifacts are missing, inspect the training script's output path and update either the script or `tahuna.toml` so they match.

For storage cleanup or browsing beyond the CLI surface, use the Tahuna dashboard Storage view. Do not delete run artifacts unless the user explicitly asks.

## Troubleshooting

Use these first checks:

- authentication failure: run `tahuna login`
- missing environment: run `tahuna init .`
- no synced code: run `tahuna sync`
- no GPU capacity: choose another GPU with similar or larger VRAM
- missing dependency: update `pyproject.toml`, lock dependencies, and rerun
- missing secret: set it with `tahuna env_vars set`
- out of disk: increase volume before increasing GPU
- out of memory: choose a GPU with more VRAM, reduce batch size, or use a smaller model
- provider missing: configure Runpod in the Tahuna dashboard Providers view
- provider balance: fund the provider account or choose a different configured account
- quiet startup: check whether dependencies or model weights are still installing/downloading
- artifact mismatch: align `tahuna.toml` output directory with the script's actual output path
- stale active compute: cancel active runs or stop unneeded serves

## Cleanup And Handoff

End with:

- run ID and status
- command used
- selected GPU/count/volume
- artifact path to serve
- relevant logs or error summary
- cleanup command if the run is still active
- next step, usually `$tahuna-serve-model` for completed model artifacts
