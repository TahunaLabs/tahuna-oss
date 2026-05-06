# BYOK

Last reviewed: 2026-05-07

## Current Behavior

Tahuna supports bring-your-own-key for Runpod only.

Users manage the Runpod key from the dashboard Providers view. Saving a key trims and validates it against Runpod, encrypts it, stores a prefix and fingerprint, and revokes any previously active Runpod credential for that user. Revocation marks active rows with `revokedAt`.

Runs and serves resolve the latest active Runpod credential when provisioning compute. The selected credential id is stored on the run or serve record as `providerCredentialId`.

## Data Model

Runpod credentials live in `runpodCredentials`:

- `userId`
- encrypted key fields: `keyCiphertext`, `keyIv`, `keyVersion`
- display and identity fields: `keyPrefix`, `fingerprint`
- lifecycle fields: `validatedAt`, `updatedAt`, optional `revokedAt`

## Security

- Plaintext Runpod keys are never stored.
- The dashboard only displays whether a key is configured plus its prefix and timestamps.
- Runtime env vars are separate from provider credentials.
- A revoked provider key is not selected for new runs or serves.

## Limits

- There is no provider choice beyond Runpod in the current codebase.
- There is no multi-key selection UI; the latest active credential is used.
