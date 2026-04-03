# Secrets Management

Last updated: 2026-04-03

Tahuna stores runtime env vars as user-scoped secrets in Convex. Environments do not own secrets. Tahuna only stores artifacts and runtime metadata.

## User-Managed Env Vars

Any runtime env var is user-managed unless it is explicitly reserved by Tahuna.

This includes Hugging Face env vars. Tahuna does not reserve HF-specific keys.

Examples:

- `HF_TOKEN`
- `HUGGINGFACE_HUB_TOKEN`
- `HF_HOME`
- `HF_HUB_CACHE`
- `HUGGINGFACE_HUB_CACHE`
- `HF_XET_CACHE`
- `HF_DATASETS_CACHE`
- `WANDB_PROJECT`
- `WANDB_ENTITY`
- `WANDB_API_KEY`
- `WANDB_BASE_URL`
- any other app-specific key required by user code

If a user wants to override Tahuna's default W&B behavior, they can do so with `WANDB_PROJECT`, `WANDB_ENTITY`, `WANDB_API_KEY`, and `WANDB_BASE_URL`.

## System-Managed Env Vars

Tahuna reserves only the vars required for runtime/bootstrap correctness and the vars it already injects today.

Reserved keys:

- all `TAHUNA_*` vars
- `PATH`
- `VIRTUAL_ENV`
- `UV_PROJECT_ENVIRONMENT`

Everything else belongs to the user env-var store.

## Security

- values are encrypted at rest with `TAHUNA_CREDENTIALS_SECRET`
- values are stored as user-scoped records in Convex
- `list` returns names only, never decrypted values
- `get NAME` returns one decrypted value for the authenticated user
- env-var CRUD stays behind normal user API auth
- Warden does not get broad secret-read access
- the backend resolves the user env set at run or serve launch and injects only the effective env for that resource
- runtime bearer tokens must not be allowed to list or read the whole env-var store
- logs and errors must never print plaintext secret values
