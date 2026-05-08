---
name: tahuna-train-project
description: User-facing Tahuna training workflow. Use when an agent is helping a Tahuna user prepare a Python project for training, validate tahuna.toml, sync code/data, set runtime environment variables, launch tahuna train, monitor logs/status, inspect artifacts, or troubleshoot failed training runs.
---

# Tahuna Train Project

## Goal

Help a user launch and inspect a Tahuna training run from their own project directory. Keep the workflow focused on the user's project files and Tahuna CLI commands.

Before starting a paid run, show the exact command and compute settings, then ask the user to confirm.

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

## Runtime Secrets

Use Tahuna env vars for runtime secrets such as model hub tokens:

```bash
tahuna env_vars list
tahuna env_vars set HF_TOKEN=...
tahuna env_vars set --from-file .env.local
```

Do not print secret values in logs or summaries. If using a file, inspect only the variable names unless the user explicitly asks.

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

If the data directory is huge or wrong, stop and fix `tahuna.toml` before syncing.

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

## Monitor

Use run commands after launch:

```bash
tahuna run list
tahuna run show <run_id>
tahuna run logs <run_id>
tahuna run watch <run_id>
```

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

Confirm that expected model files are present under the configured output directory. Use this path later for serving, for example:

```bash
tahuna serve create --from-run <run_id> --model-path outputs/model
```

If the run completed but expected artifacts are missing, inspect the training script's output path and update either the script or `tahuna.toml` so they match.

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
