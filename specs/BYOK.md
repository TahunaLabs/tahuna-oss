# BYOK

Last reviewed: 2026-05-14

## Product Status

BYOK is not part of the main hosted Tahuna Cloud path.

Tahuna Cloud should use managed billing only:

- users buy Tahuna credits,
- Tahuna launches compute with deployment-owned provider credentials,
- Tahuna pays the compute provider,
- Tahuna debits Tahuna credits for compute and storage usage.

## Legacy State

Older code may still contain user-owned RunPod credential storage and provider-resolution paths:

- `runpodCredentials`
- dashboard Providers UI
- `billing_mode: "byok"`
- user credential resolution for runs or serves

These are legacy implementation details to remove from the hosted cloud product. Do not build new cloud UX or API behavior on top of them.

## Removal Target

Fully managed billing means:

- no public billing-mode selector,
- no public `billing_mode` argument,
- no dashboard Providers page for RunPod API keys,
- no user-owned provider credential requirement before launching,
- no code path that skips Tahuna credit debits for hosted runs,
- no managed-to-BYOK or BYOK-to-managed fallback.

If a self-hosted BYOK mode is needed later, it should be implemented as a separate deployment/configuration mode with a different product surface, not as a hosted per-user or per-run choice.

## Data Retention

Do not casually delete historical credential rows or fields until active runs, serves, and termination jobs no longer depend on them. Existing records can remain inert legacy data while the hosted product path stops reading or writing them.
