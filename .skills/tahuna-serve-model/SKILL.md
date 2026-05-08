---
name: tahuna-serve-model
description: User-facing Tahuna serving workflow. Use when an agent is helping a Tahuna user configure inference.py or serve settings, deploy a model from a completed run or storage prefix, monitor tahuna serve status/logs, call the authenticated inference endpoint, or stop a running serve.
---

# Tahuna Serve Model

## Goal

Help a user turn a trained model artifact into a Tahuna serve. Assume the agent is operating in the user's project directory and using the Tahuna CLI.

Before starting a long-running serve, show the source model path/prefix, compute settings when known, and stop command, then ask the user to confirm.

## Preflight

Check the project and model source:

```bash
pwd
test -f tahuna.toml && sed -n '1,260p' tahuna.toml
test -f inference.py && sed -n '1,220p' inference.py
tahuna run list
```

If the user wants to serve a completed training run, identify:

- run ID
- artifact path inside the run output, such as `outputs/model` or `outputs/adapter`
- whether `inference.py` expects `TAHUNA_MODEL_ROOT`

If the user wants to serve an existing storage prefix, identify the exact prefix before creating the serve.

## Inference App Contract

The user's inference app owns request and response semantics. Tahuna owns provisioning, model materialization, health checks, logs, lifecycle, and authenticated proxying.

The inference process should:

- listen on the configured serve port
- expose the configured health path
- load the model from `TAHUNA_MODEL_ROOT` when possible
- avoid embedding API keys or secrets in source
- keep startup logs informative enough to debug model loading

Use Tahuna env vars for runtime secrets:

```bash
tahuna env_vars set HF_TOKEN=...
```

## Configure Serve Settings

Check that `tahuna.toml` has a `[serve]` section when serving is expected. It should include a command, dependency group if needed, port, health path, and default model path.

Common expectations:

- command runs from the project root
- command is an array of tokens
- dependency group is empty for base dependencies or the selected serve group
- health path returns success only when the app is ready
- default model path matches the artifact path produced by training

If the serve dependency group is missing packages used by `inference.py`, update the user's `pyproject.toml` only with their approval.

## Create A Serve

From a completed run:

```bash
tahuna serve create --from-run <run_id> --model-path <artifact_path>
```

From a storage prefix:

```bash
tahuna serve create --from-storage-prefix <prefix>
```

Use the explicit `--model-path` for run artifacts when there is any ambiguity. Do not guess between adapter-only and full-model directories; inspect the training output or ask the user.

## Monitor

Use:

```bash
tahuna serve list
tahuna serve show <serve_id>
tahuna serve logs <serve_id>
```

For startup failures, inspect:

- model path or storage prefix
- dependency group
- port and health path
- recent serve logs
- whether the app binds to the expected host/port
- whether model downloads require an env var such as `HF_TOKEN`

## Call Inference

User-facing inference should go through Tahuna, not a raw provider URL:

```text
/api/serves/{serve_id}/inference[/...]
```

The path after `/inference` is forwarded to the user's app. The payload shape is whatever `inference.py` implements.

Example shape:

```bash
curl -X POST "https://tahuna.app/api/serves/<serve_id>/inference" \
  -H "Authorization: Bearer <tahuna_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello"}'
```

Do not promise OpenAI-compatible routes unless the user's `inference.py` implements them.

## Stop

Serves are long-running. Stop them when no longer needed:

```bash
tahuna serve stop <serve_id>
```

Use force only when graceful stop does not work:

```bash
tahuna serve stop <serve_id> --force
```

End with a short handoff:

- serve ID
- model source
- health/status
- inference URL
- stop command
