# Secrets Management

Last updated: 2026-04-03

## Objective

Tahuna should support user-managed runtime environment variables and secrets for runs and serves without making local files or local shell state the source of truth.

This spec defines the canonical design for values such as:

- `HF_TOKEN`
- `HUGGINGFACE_HUB_TOKEN`
- `WANDB_PROJECT`
- `WANDB_ENTITY`
- custom model registry or API endpoint credentials

This spec does not replace the existing Runpod BYOK flow documented in `specs/BYOK.md`.

## Core Rule

User-managed runtime env vars are scoped to a Tahuna environment.

They are not global to the user account, and they are not stored in local `tahuna.toml`.

Rationale:

- runs and serves already derive their runtime contract from a Tahuna environment
- different environments may require different provider tokens, registry URLs, or tracking settings
- linked-environment CLI behavior already exists and gives a clean default scope

The CLI may omit an explicit environment ID and default to the linked environment, but the remote storage model remains environment-scoped.

## CLI Surface

Tahuna exposes a dedicated env-var command family:

- `tahuna env_vars list`
- `tahuna env_vars get NAME`
- `tahuna env_vars set --from-file .env.tahuna`
- `tahuna env_vars remove NAME`

Expected behavior:

- commands default to the linked environment when one exists
- commands may also accept `--id <env_id>` to target a specific environment explicitly
- `.env.tahuna` is an import source only, not the canonical store
- values are stored server-side in Convex, not in local project config

Future extensions may add:

- `tahuna env_vars set NAME=value`
- `tahuna env_vars set NAME --value <value>`

but the canonical MVP surface is the four commands above.

## Ownership Split

Tahuna must distinguish between system-managed runtime env vars and user-managed env vars.

### System-Managed Runtime Vars

These are owned by Tahuna runtime/bootstrap logic and must not be overridden from the env-var store:

- all `TAHUNA_*` vars
- `PATH`
- `VIRTUAL_ENV`
- `UV_PROJECT_ENVIRONMENT`
- `XDG_CACHE_HOME`
- `HF_HOME`
- `HF_HUB_CACHE`
- `HUGGINGFACE_HUB_CACHE`
- `HF_XET_CACHE`
- `HF_DATASETS_CACHE`

These values are part of runtime correctness and workspace isolation.

In particular, Hugging Face cache location vars remain runtime-owned so downloads land on the mounted workspace volume rather than the pod root filesystem.

### User-Managed Runtime Vars

These are stored in Convex and injected into runtime processes when present:

- Hugging Face auth tokens such as `HF_TOKEN` and `HUGGINGFACE_HUB_TOKEN`
- W&B configuration such as `WANDB_PROJECT`, `WANDB_ENTITY`, and optionally `WANDB_API_KEY`
- custom endpoint and credential vars required by user code

These values exist to support application behavior, not runtime bootstrapping.

## Storage Model

Tahuna stores user-managed runtime env vars in Convex as environment-scoped records.

Recommended table shape:

- `userId`
- `environmentId`
- `name`
- `valueCiphertext`
- `valueIv`
- `valueVersion`
- `updatedAt`

Recommended indexes:

- by environment
- by environment + name

The secret value must be encrypted at rest using the same server-side AES-GCM pattern used for Runpod credentials.

Notes:

- `list` should return names and metadata only, not decrypted values
- `get NAME` should return the decrypted value for that one key
- duplicate keys are not allowed within the same environment
- keys are case-sensitive and preserved as entered

## Operator Setup

Tahuna should reuse the existing server master secret model for reversible secret storage.

Current operator requirement:

- `TAHUNA_CREDENTIALS_SECRET`

If Tahuna later separates provider-credential encryption from runtime-secret encryption, that new server-side key must be documented explicitly. Until then, one server master key is the canonical model.

## API Surface

The CLI should talk to explicit environment-scoped REST endpoints.

Recommended canonical routes:

- `GET /api/environments/{env_id}/env-vars`
- `GET /api/environments/{env_id}/env-vars/{name}`
- `POST /api/environments/{env_id}/env-vars/import`
- `DELETE /api/environments/{env_id}/env-vars/{name}`

Import request shape:

```json
{
  "values": {
    "HF_TOKEN": "hf_...",
    "WANDB_PROJECT": "my-project"
  }
}
```

Import semantics:

- replace existing values for matching keys in that environment
- leave unrelated keys unchanged
- reject reserved/system-managed keys

## Runtime Injection Model

User-managed env vars are resolved and decrypted during pod provisioning.

They are merged into the pod environment for both:

- run provisioning
- serve provisioning

The merge point is the existing runtime pod env construction step, where Tahuna already injects runtime callback variables.

## Precedence Rules

Final runtime env precedence is:

1. Tahuna system-managed reserved vars
2. user-managed environment env vars
3. library/runtime defaults inside the container image

Implications:

- user-managed vars may override neutral application vars such as `WANDB_PROJECT`, `WANDB_ENTITY`, `WANDB_API_KEY`, or `WANDB_BASE_URL`
- user-managed vars may not override reserved runtime/bootstrap vars or cache-path vars

If a user points `WANDB_BASE_URL` away from Tahuna, Tahuna should not assume it can still inject a runtime token as `WANDB_API_KEY`.

## Run And Serve Snapshot Semantics

Env-var changes are not retroactive.

When a run or serve is created, Tahuna should snapshot the effective env-var set onto the created resource, either directly or via a stable hash/version reference.

This is required so that:

- a running or queued resource does not change behavior because the environment record was edited later
- debug and audit trails can explain which secret/config set was used
- serve restarts and cleanup use stable configuration

Practical rule:

- editing environment env vars affects new runs and new serves
- existing runs keep the env-var snapshot they were created with
- existing serves should require restart or recreate before changed env vars take effect

## Local File Behavior

`.env.tahuna` is a convenience import format only.

It should:

- be safe to use with `tahuna env_vars set --from-file .env.tahuna`
- not be treated as canonical state
- not be written back automatically by Tahuna
- be gitignored in normal project setups

Tahuna should not mirror remote secret values into `tahuna.toml`.

## Failure Modes

If a requested env-var key does not exist:

- `get NAME` returns a clear not-found error
- `remove NAME` may either return not-found or succeed as a no-op, but the behavior must be documented and consistent

If an import file contains reserved keys:

- the request must fail with a clear error listing the rejected names

If the server master encryption key is missing:

- env-var save/import must fail
- existing encrypted values cannot be decrypted for runtime injection

If pod provisioning cannot decrypt or resolve the environment env-var set:

- provisioning fails before the pod is considered healthy
- the error should identify env-var resolution as the failure source rather than reporting a generic runtime bootstrap failure

## Security Model

Tahuna must never expose all decrypted secret values as part of normal environment reads.

Security requirements:

- values are encrypted at rest
- plaintext values are decrypted only inside server-side actions/mutations that need them
- `list` returns names only
- logs must never print decrypted secret values
- runtime logs and failure messages must redact secret material

The CLI remains a remote control plane client:

- it authenticates to Tahuna
- it requests server-side secret storage and lookup
- it must not become a second local secret store

## Verification

Recommended verification path:

1. Create or link an environment.
2. Import a file with `HF_TOKEN` and `WANDB_PROJECT`.
3. Confirm `tahuna env_vars list` shows the names but not decrypted values.
4. Confirm `tahuna env_vars get HF_TOKEN` returns the stored value.
5. Launch a run that downloads from Hugging Face.
6. Confirm the runtime receives the token and still uses Tahuna-managed workspace cache paths.
7. Update the env var value.
8. Confirm a new run sees the updated value while an already-created run keeps its original snapshot.
