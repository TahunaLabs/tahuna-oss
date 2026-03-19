# Spec: User Credits Ledger

## Why Transparency Matters First

Payments transparency requires:

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
- Debits currently applied for minute-by-minute run compute accrual and storage size growth.

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

- `currency: "USD"`
- `initialCreditCents: 1000` (USD 10.00)
- `computeVolumeGbHourlyRateCents: 2`
- `storageGiBDeltaRateCents: 3`
- `minimumChargeCents: 1`

RunPod GPU hourly inputs come from `web/lib/runpod-gpu-pricing.ts`:

- `gpuType -> pricePerHour` static lookup table
- compute billing requires `gpuType` to resolve from that table
- unmapped GPU types are rejected at run creation (no fallback/default GPU rate)

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

Current top-up policy:

- Manual self-serve top-up is disabled.
- Users cannot arbitrarily grant themselves credits.
- Payment checkout/card rails are not integrated yet.

### Compute Charging (Current)

Current compute model is minute accrual + terminal settlement:

1. On run create:
   - resolve strict hourly pricing:
     - `hourlyRate = gpuCount * gpuTypeHourlyRateCents + volumeGb * computeVolumeGbHourlyRateCents`
   - persist `computeHourlyRateCents` on the run row.
   - no upfront reservation debit.
2. Every minute (batched cron):
   - for each running run, compute cumulative target usage:
     - `targetCharge = max(minimumChargeCents, ceil(hourlyRate * uptimeMs / 3600000))` once uptime > 0
   - debit only incremental delta:
     - `delta = targetCharge - computeCollectedCents`
   - when debit cannot be collected, record owed event metadata.
3. On terminal run states, perform reconciliation:
   - charge or refund the remaining delta to align final `computeChargeCents` with runtime duration.

Run row tracks:

- `computeHourlyRateCents`
- `creditsReservedCents`
- `computeChargeCents`
- `computeCollectedCents`
- `computeOutstandingCents`
- `computeChargeStatus` (`pending`/`charged`/`owed`)
- `computeStartedAt`

Important current limitations:

- GPU pricing is a static TypeScript lookup, not a versioned pricing catalog yet.
- Unknown/unmapped GPU labels fail fast at run creation; operationally this requires catalog/name hygiene.
- Minute accrual still depends on `computeStartedAt`/runtime lifecycle timing quality.

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

### Current UI Surface

- Billing has a dedicated dashboard page.
- The page shows:
  - current account balance,
  - policy state (bootstrap credit/manual top-up disabled/payment checkout pending),
  - usage ledger history (`event`, `delta`, `balance_after`, `reference`, `timestamp`).

## What It Should Be (Target State)

To be user-trustworthy and payment-ready, we should add:

1. Real top-up/checkout rails
- Connect Stripe/Lemon/etc. so credits are purchased, not manually granted.

2. Public pricing catalog
- Publish rates by billable resource (including likely `gpuType` tiers), with version/effective date.

3. Pre-run estimate in UI/API
- Show expected hourly and projected spend before launch (and what inputs are used).

4. Settlement hardening
- Add idempotency keys + replay-safe settlement for terminal events.
- Define debt/arrears handling when settlement debit exceeds available balance.

5. Explicit lifecycle policy
- Define/communicate how queued/provisioning/running/cancelled/failed states affect charges.

6. User-facing ledger/history surface (v2)
- Keep current ledger table and add filters, pagination, and CSV export.

7. Billing artifacts
- Receipts/invoices for top-ups and period summaries.

8. Balance safety
- Low-balance alerts, hard-stop thresholds, optional auto top-up.

9. Accounting safety hardening
- Idempotency for billing events, race-safe updates, reconciliation checks/jobs.

10. Admin/ops tooling
- Controlled manual adjustments with actor attribution, reason, and immutable audit trail.
