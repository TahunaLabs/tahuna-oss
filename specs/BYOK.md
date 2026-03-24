# BYOK

Last updated: 2026-03-24

## Objective

Tahuna supports Bring Your Own Key for Runpod through one encrypted Runpod API key per user.

The key is:

- entered in the dashboard UI
- validated server-side against Runpod before it is stored
- encrypted at rest with a server master key
- resolved server-side whenever Tahuna calls Runpod

This is not a local CLI secret flow. The CLI continues to authenticate to Tahuna only.

## Current Scope

The current BYOK implementation covers Runpod only.

It is used for:

- dynamic GPU catalog lookup
- pod creation
- pod termination
- termination retry paths

## Operator Setup

The Tahuna server must be configured with:

- `TAHUNA_RUNPOD_CREDENTIALS_KEY`

This value must be a base64-encoded 32-byte key.

Example:

```bash
openssl rand -base64 32
```

The key is documented in `web/.env.example`.

Without this server master key, Tahuna cannot encrypt or decrypt per-user Runpod credentials.

## User Flow

Users add their Runpod key in:

- Dashboard
- Settings
- Runpod card

The Runpod settings card supports:

- save key
- replace key
- disable key for new launches
- configured status display

The key is never returned to the client after save.

## Storage Model

Tahuna stores Runpod credentials in the `runpodCredentials` table.

Stored fields:

- `userId`
- `keyCiphertext`
- `keyIv`
- `keyVersion`
- `keyPrefix`
- `fingerprint`
- `validatedAt`
- `revokedAt`
- `updatedAt`

Notes:

- `keyCiphertext` and `keyIv` are used for reversible AES-GCM decryption on the server
- `keyPrefix` and `fingerprint` are metadata only; the current UI exposes the key prefix but not the fingerprint
- `revokedAt` is a logical disable flag for new launches, not a hard delete of provider history

## Security Model

Tahuna does not use one global Runpod API key anymore.

Instead:

- each user has their own encrypted Runpod key
- Tahuna resolves the active key server-side for the authenticated user
- plaintext Runpod keys are short-lived and used only inside server actions
- the CLI does not persist Runpod keys locally

This makes the UI the canonical credential entry point.

## Run Lifecycle Semantics

When a run is created, Tahuna snapshots the current Runpod credential onto the run row:

- `runpodCredentialId`

This is required so that:

- a pod can still be terminated even if the user later replaces the active key
- retries and cleanup paths keep using the same provider credential that created the pod

New launches use the currently active credential.

Existing runs keep the credential snapshot they were created with.

## Disable and Replace Behavior

Disabling a Runpod key:

- prevents new launches from using it
- does not break cleanup for already-created runs

Replacing a Runpod key:

- affects new launches only
- does not rewrite existing runs

The UI intentionally describes this behavior so users understand that key changes are not retroactive.

## CLI Behavior

There is currently no CLI command to set a Runpod key.

The CLI uses the server-stored key indirectly after the user has saved it in the dashboard UI.

Practical effect:

- `tahuna gpus list` uses the saved per-user Runpod key through the backend
- `tahuna run create` uses the saved per-user Runpod key through the backend

Future CLI commands may be added for server-side key management, but they must not store the Runpod key locally.

## Failure Modes

If no Runpod key is configured for the user:

- dashboard run launch is blocked with a clear error
- CLI GPU lookup and run creation fail with a clear error

If Runpod validation fails during save:

- the key is not stored
- the user sees the validation error

If pod termination fails:

- Tahuna retries termination using the run's snapshotted `runpodCredentialId`

## Verification

Recommended verification path:

1. Set `TAHUNA_RUNPOD_CREDENTIALS_KEY` on the server.
2. Open Dashboard Settings and save a valid Runpod key.
3. Confirm the Runpod card shows configured status.
4. Run `tahuna gpus list` and confirm GPUs load for that user.
5. Launch a run from the dashboard or CLI.
6. Cancel the run and confirm termination still succeeds.
7. Replace or disable the active key.
8. Confirm new launches use the new state, while existing cleanup still works.

## Known Limitation

Convex code generation requires a configured `CONVEX_DEPLOYMENT`.

In environments where that is missing, generated API typings may need to be refreshed later once Convex is configured correctly.
