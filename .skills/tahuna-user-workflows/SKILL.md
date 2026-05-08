---
name: tahuna-user-workflows
description: End-user Tahuna project workflows for agents. Use when helping someone initialize a Tahuna Python project, sync code or data, launch or inspect training runs, configure env vars, create serving deployments, or reason about the Tahuna product contract across CLI, web, and runtime.
---

# Tahuna User Workflows

## Source Of Truth

Read these files only as needed:

- [CONTEXT.md](../../CONTEXT.md) for current product status and code map.
- [specs/python-inference-app-contract.md](../../specs/python-inference-app-contract.md) for the canonical Python project contract.
- [specs/sync.md](../../specs/sync.md) for code/data/config sync behavior.
- [specs/run-lifecycle.md](../../specs/run-lifecycle.md) for training lifecycle behavior.
- [specs/serve.md](../../specs/serve.md) only as historical serving context; defer to the Python contract for current behavior.
- [cli/README.md](../../cli/README.md) for local CLI usage and validation.

## Project Contract

Tahuna runs user-owned Python projects. Keep the contract centered on:

- `tahuna.toml` as the root source of truth for synced environment, train, and serve config.
- `pyproject.toml` and `uv.lock` for dependencies.
- `train.py` when scaffolded or selected for training.
- `inference.py` when serving is enabled or detected.
- `.tahuna/environment_id` and sync manifest files as local state, not canonical config.

Commands in `tahuna.toml` are arrays of tokens. Warden executes the configured command directly from the workspace root.

## Normal CLI Flow

Use production `tahuna` for real product workflows and `tahuna-dev` for local development workflows.

Common project flow:

```bash
tahuna login
tahuna init .
tahuna sync
tahuna train
tahuna run list
```

For local development against the app:

```bash
make install-cli-dev
tahuna-dev login
tahuna-dev init .
tahuna-dev train -d
```

Do not tell users to create environments directly with an `env create` command. Environment creation is currently through `tahuna init`.

## Sync Semantics

Remember these invariants when explaining or changing workflows:

- `tahuna init` performs a config-only sync after environment creation.
- `tahuna sync` syncs code and data.
- `tahuna sync code` syncs only code.
- `tahuna sync data` syncs only the configured data directory.
- `tahuna train` and `tahuna run create` always auto-sync before run creation.
- Code sync excludes `.tahuna/`, `.git/`, `node_modules/`, `__pycache__/`, configured data, configured outputs, and `.gitignore` patterns.
- Output artifacts are uploaded from the machine runtime after training; local output directories do not override remote artifacts.

## Training

Training runs materialize code/data, install dependencies with `uv`, execute the configured training command, stream logs and metrics, then upload configured output artifacts.

Use:

```bash
tahuna train
tahuna train -d
tahuna run show <run_id>
tahuna run logs <run_id>
tahuna run watch <run_id>
```

GPU overrides belong on run creation commands:

```bash
tahuna train --gpu-type <gpu> --gpu-count <n> --volume-gb <n>
```

Interactive terminals may prompt for an alternate GPU after a no-capacity response. Non-interactive terminals should fail with the no-capacity error.

## Runtime Env Vars

Environment variables are environment-scoped:

```bash
tahuna env_vars list
tahuna env_vars get <name>
tahuna env_vars set NAME=value
tahuna env_vars set NAME --value <value>
tahuna env_vars set --from-file .env.local
tahuna env_vars rm <name>
```

List output returns names only by default. JSON-style details are reserved for verbose output.

## Serving

Serving deployments materialize code, data, and a pinned model snapshot. User code owns the inference server; Tahuna owns provisioning, materialization, health, logs, lifecycle callbacks, and authenticated proxying.

Use:

```bash
tahuna serve create --from-run <run_id> --model-path <path>
tahuna serve create --from-storage-prefix <prefix>
tahuna serve list
tahuna serve show <serve_id>
tahuna serve logs <serve_id>
tahuna serve stop <serve_id>
```

User-facing inference traffic should go through Tahuna:

```text
/api/serves/{serve_id}/inference[/...]
```

Do not direct users to call raw provider URLs as the canonical product surface.
