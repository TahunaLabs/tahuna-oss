---
name: tahuna-serve-model
description: User-facing Tahuna serving workflow. Use when an agent is helping a Tahuna user configure inference.py or serve settings, choose a run artifact or storage prefix, deploy a model as a long-running serve, prepare API-key/authenticated inference calls, monitor tahuna serve status/logs, control serving cost, or stop a running serve.
---

# Tahuna Serve Model

## Goal

Help a user turn a trained model artifact into a Tahuna serve. Assume the agent is operating in the user's project directory and using the Tahuna CLI.

Before starting a long-running serve, show the source model path/prefix, compute settings when known, inference URL shape, and stop command, then ask the user to confirm.

## Preflight

Check the project and model source:

```bash
pwd
test -f tahuna.toml && sed -n '1,260p' tahuna.toml
test -f inference.py && sed -n '1,220p' inference.py
tahuna run list
tahuna serve list
```

If the user wants to serve a completed training run, identify:

- run ID
- artifact path inside the run output, such as `outputs/model` or `outputs/adapter`
- whether `inference.py` expects `TAHUNA_MODEL_ROOT`

If the user wants to serve an existing storage prefix, identify the exact prefix before creating the serve.

If no compute provider is configured or the provider balance is insufficient, stop and ask the user to fix the Tahuna dashboard Providers setup before provisioning.

## Cost And Lifecycle Safety

Serves are long-running compute. Always check existing serves before creating another one:

```bash
tahuna serve list
```

If an old serve is no longer needed, stop it first:

```bash
tahuna serve stop <serve_id>
```

Do not create duplicate serves for the same model unless the user explicitly wants parallel deployments. If pricing is not displayed by Tahuna, avoid estimating exact cost and make the long-running risk explicit.

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

Do not put user-facing Tahuna API keys, provider credentials, or runtime tokens in `inference.py`. The Python app should trust the Tahuna proxy for user authentication and only handle inference semantics.

## Configure Serve Settings

Check that `tahuna.toml` has a `[serve]` section when serving is expected. It should include a command, dependency group if needed, port, health path, and default model path.

Common expectations:

- command runs from the project root
- command is an array of tokens
- dependency group is empty for base dependencies or the selected serve group
- health path returns success only when the app is ready
- default model path matches the artifact path produced by training

If the serve dependency group is missing packages used by `inference.py`, update the user's `pyproject.toml` only with their approval.

Local smoke check when safe:

```bash
uv run python -m py_compile inference.py
```

If the app has a fast local health check, run it. Skip local startup when it would download large models or require unavailable GPU hardware.

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

If serving from a run, use `tahuna run show <run_id>` to confirm the artifact path. If serving from a storage prefix, copy the prefix exactly from Tahuna's storage/dashboard surface.

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

Do not treat a serve as ready until `tahuna serve show <serve_id>` reports a serving/healthy state and the configured health path has passed.

## Call Inference

User-facing inference should go through Tahuna, not a raw provider URL:

```text
/api/serves/{serve_id}/inference[/...]
```

The path after `/inference` is forwarded to the user's app. The payload shape is whatever `inference.py` implements.

For non-browser calls, the user needs a Tahuna API key from the Tahuna dashboard. Keep that API key outside source control and shell history where possible.

Example shape:

```bash
curl -X POST "https://tahuna.app/api/serves/<serve_id>/inference" \
  -H "Authorization: Bearer <tahuna_api_key>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Hello"}'
```

Do not promise OpenAI-compatible routes unless the user's `inference.py` implements them.

If the app exposes nested routes, append the route after `/inference`, for example:

```text
/api/serves/{serve_id}/inference/v1/chat/completions
```

Only use this shape when `inference.py` actually implements that route.

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
- API-key requirement for non-browser clients
- any active duplicate serves that should be reviewed
