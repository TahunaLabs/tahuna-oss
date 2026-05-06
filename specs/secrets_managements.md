# Secrets Management

Last reviewed: 2026-05-07

## Current Behavior

Runtime environment variables are stored per environment in `envVars`. Values are encrypted at rest and decrypted only for authenticated users with access to the environment or for backend provisioning of a specific run or serve.

`env_vars` CLI commands operate on the linked environment:

- `list`
- `get`
- `set`
- `rm`

## User-Managed Env Vars

Users can store application-specific env vars such as:

- Hugging Face tokens/cache paths
- W&B variables
- dataset or service credentials
- any other non-reserved runtime variable

Tahuna injects the effective env var set into the provisioned runtime.

## Reserved Env Vars

Tahuna reserves runtime/bootstrap variables required for correctness:

- all `TAHUNA_*`
- `PATH`
- `VIRTUAL_ENV`
- `UV_PROJECT_ENVIRONMENT`

## Provider Credentials

Runpod API keys are not runtime env vars. They live in `runpodCredentials` and are used by the control plane to provision compute.

## Invariants

- List operations return names, not secret values.
- Plaintext secrets must not be logged.
- Runtime tokens cannot list or read the whole env-var store.
