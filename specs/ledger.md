# Spec: User Credits Ledger

## Why Transparency Matters First


Payements transparency :

- Clear pricing inputs and formulas.
- Clear trigger points for debits/credits.
- User-visible history for every balance mutation.
- Explicit policy for edge cases (cancel, fail, partial usage).

Without this, users experience billing as "guesswork," even if the backend logic is internally consistent.

## What We Have Right Now

### Scope

Current implementation is internal credits accounting:

- Internal credit accounting only (no bank/payment-provider integration yet).
- One credit balance per Better Auth user.
- Append-only usage history for every debit/credit.
- Debits currently applied for run compute reservation and storage size growth.

### Identity Source of Truth

- Users come from Better Auth (Convex component).
- Session-authenticated requests resolve via `authComponent.getAuthUser(...)`.
- API key-authenticated requests resolve via `apiKeys.userId`.
- Ledger entries are keyed by canonical `userId`.

### Data Model

`userCredits` (current balance):

- `userId`
- `balanceCents`
- `currency`
- `createdAt`, `updatedAt`

`usageEvents` (append-only history):

- `userId`
- `eventType`
- `creditsDeltaCents` (positive credit, negative debit)
- `balanceAfterCents`
- `referenceType`, `referenceId` (optional)
- `metadata` (optional)
- `createdAt`

### Config Used Today

`BILLING_CONFIG` in `web/config.ts`:

- `currency: "EUR"`
- `initialCreditCents: 0`
- `computeReservationHours: 1`
- `computeGpuHourlyRateCents: 120`
- `computeVolumeGbHourlyRateCents: 2`
- `storageGiBDeltaRateCents: 3`
- `minimumChargeCents: 1`

### Initialization Flow

On authenticated app/CLI usage:

1. Resolve canonical user id from Better Auth/API key.
2. Ensure one `userCredits` row exists for that user.
3. On first initialization, set `balanceCents = initialCreditCents`.
4. Insert `usageEvents` row:
   - `eventType = "initial_grant"`
   - `creditsDeltaCents = +initialCreditCents`

### Debit/Credit Primitives

Shared helpers in `web/convex/credits.ts`:

- `consumeUserCredits(...)`
  - checks `balanceCents >= amount`
  - debits balance
  - inserts negative usage event
  - returns `null` on insufficient credits
- `grantUserCredits(...)`
  - increments balance
  - inserts positive usage event

### Compute Charging (Current)

Current compute model is reservation-at-create:

1. On run create, estimate reservation:
   - `hourlyRate = gpuCount * computeGpuHourlyRateCents + volumeGb * computeVolumeGbHourlyRateCents`
   - `reserved = max(minimumChargeCents, ceil(hourlyRate * computeReservationHours))`
2. Debit with `eventType = "run_compute_reserved"`.
3. If insufficient credits, run creation fails (`insufficient credits`, HTTP `402` on API routes).

Run row tracks:

- `creditsReservedCents`
- `computeChargeCents`
- `computeChargeStatus` (`pending`/`charged`/`failed`)
- `computeStartedAt`

Important current limitations:

- Pricing uses `gpuCount` + `volumeGb` only.
- `gpuType` is tracked but not used to select pricing tiers.
- No duration-based settlement (no post-run per-second/per-minute reconciliation).
- No automatic refund path.

### Storage Charging (Current)

Storage debits are applied on indexed size growth:

1. Compute size delta: `newSize - previousSize`.
2. If delta > 0:
   - `deltaGiB = sizeDeltaBytes / (1024^3)`
   - `deltaCents = max(minimumChargeCents, ceil(deltaGiB * storageGiBDeltaRateCents))`
   - debit with `storage_charge`
3. If delta <= 0: no-op.

Trigger points:

- Data upload indexing (`storageObjects` upsert for data uploads).
- Run artifact indexing (`storageObjects` upsert for run artifacts).

### Invariants

- Better Auth is the identity source of truth.
- `userCredits` is current state.
- `usageEvents` is append-only history.
- Every balance mutation has a usage event.
- Balances are integer cents.

## What It Should Be (Target State)

To be user-trustworthy and payment-ready, we should add:

1. Real top-up/checkout rails
- Connect Stripe/Lemon/etc. so credits are purchased, not manually granted.

2. Public pricing catalog
- Publish rates by billable resource (including likely `gpuType` tiers), with version/effective date.

3. Pre-run estimate in UI/API
- Show expected reservation before launch (and what inputs are used).

4. Duration-based compute settlement
- Meter actual runtime usage and settle final charge at terminal state.

5. Explicit lifecycle policy
- Define/communicate how queued/provisioning/running/cancelled/failed states affect charges.

6. User-facing ledger/history surface
- Show event history (date, reason, delta, balance-after), filters, and CSV export.

7. Billing artifacts
- Receipts/invoices for top-ups and period summaries.

8. Balance safety
- Low-balance alerts, hard-stop thresholds, optional auto top-up.

9. Accounting safety hardening
- Idempotency for billing events, race-safe updates, reconciliation checks/jobs.

10. Admin/ops tooling
- Controlled manual adjustments with actor attribution, reason, and immutable audit trail.
