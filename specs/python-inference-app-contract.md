# Python Project Contract

Last reviewed: 2026-05-07

## Current Behavior

Tahuna runs user-owned Python projects. The project contract is expressed by `tahuna.toml`, `pyproject.toml`, `uv.lock`, the configured training command, and optionally the configured serving command.

## Project Files

Canonical files:

- `tahuna.toml`
- `pyproject.toml`
- `uv.lock`
- `train.py` when scaffolded or selected for training
- `inference.py` when serving is enabled or detected

Local state:

- `.tahuna/environment_id`
- `.tahuna/sync_code_manifest.json`
- `.tahuna/sync_data_manifest.json`

## `tahuna.toml`

Sections used today:

- `[project]`: data and output directories.
- `[environment]`: framework, version, Python version, GPU type/count, volume.
- `[train]`: command, dependency group, output model path.
- `[serve]`: command, dependency group, Python/runtime settings, health settings, default model path.

Commands are stored as arrays of tokens. Warden executes the configured command directly from the workspace root.

## Dependencies

Dependencies are installed with `uv`. A selected dependency group may be used for training and a separate selected dependency group may be used for serving. Empty dependency group means base project dependencies.

## Training

Training runs receive materialized code and data, execute the configured command, stream logs and metrics to Tahuna, and upload files from the configured output directory as artifacts.

## Serving

Serving runs receive materialized code, data, and a pinned model snapshot. The inference process must listen on the configured port and satisfy the configured health path. Tahuna proxies authenticated user traffic through `/api/serves/{serveId}/inference/*`.

## Invariants

- Tahuna owns provisioning, materialization, dependency install, log/metric callbacks, artifact upload, and inference proxying.
- User code owns the training loop and inference server behavior.
- Tahuna does not require a framework-specific training API.
