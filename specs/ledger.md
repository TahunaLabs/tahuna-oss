# Spec: User Credits Ledger

## Scope

This document describes the current ledger implementation in Tahuna.

- Internal credit accounting only (no bank/payment-provider integration yet).
- One credit balance per Better Auth user.
- Append-only usage history for every debit/credit.
- Charges currently applied for run compute reservation and storage size growth.

## Identity Source of Truth

Users come from Better Auth (Convex component). There is no duplicate app-level `users` table for identity.

- Session-authenticated requests resolve user via `authComponent.getAuthUser(...)`.
- API key-authenticated requests resolve user via `apiKeys.userId`.
- Ledger entries are keyed by this canonical `userId`.

## Data Model

### `userCredits` (current state)

One row per user:

- `userId`: Better Auth user id
- `balanceCents`: current balance (integer cents)
- `currency`: currency code (currently `EUR`)
- `createdAt`, `updatedAt`

### `usageEvents` (history / audit)

Append-only ledger events:

- `userId`
- `eventType`
- `creditsDeltaCents` (positive for credit, negative for debit)
- `balanceAfterCents`
- `referenceType`, `referenceId` (optional)
- `metadata` (optional)
- `createdAt`

## Configuration

Billing constants are in `web/config.ts` (`BILLING_CONFIG`):

- `currency: "EUR"`
- `initialCreditCents: 5000` (50.00 EUR)
- `computeReservationHours: 1`
- `computeGpuHourlyRateCents: 120`
- `computeVolumeGbHourlyRateCents: 2`
- `storageGiBDeltaRateCents: 3`
- `minimumChargeCents: 1`

## Initialization Flow

When a user is authenticated for app/CLI usage, backend ensures ledger rows exist:

1. Resolve canonical user id from Better Auth / API key.
2. Ensure one `userCredits` row for that `userId`.
3. If first time, initialize `balanceCents = initialCreditCents`.
4. Insert `usageEvents` with:
   - `eventType = "initial_grant"`
   - `creditsDeltaCents = +initialCreditCents`

This runs on both:

- Session-authenticated backend path (`requireUser` flow).
- API key-authenticated backend path (`authenticateApiRequest` flow).

## Debit/Credit Primitives

Shared ledger helpers (Convex module):

- `consumeUserCredits(...)`:
  - checks `balanceCents >= amount`
  - debits balance
  - inserts negative `usageEvents` row
  - returns `null` on insufficient credits
- `grantUserCredits(...)`:
  - increments balance
  - inserts positive `usageEvents` row

## Run Compute Charging

### Reservation at run creation

On run create:

1. Calculate reservation:
   - `hourlyRate = gpuCount * computeGpuHourlyRateCents + volumeGb * computeVolumeGbHourlyRateCents`
   - `reserved = max(minimumChargeCents, ceil(hourlyRate * computeReservationHours))`
2. Debit with `eventType = "run_compute_reserved"`.
3. If insufficient credits:
   - run creation fails with `insufficient credits`
   - API endpoints map this to HTTP `402`.

Run row stores charging markers:

- `creditsReservedCents`
- `computeChargeCents`
- `computeChargeStatus` (`pending`/`charged`/`failed`)
- `computeStartedAt` (set when run enters `running`)

There is currently no automatic compute refund path.

## Storage Charging

Storage charges are applied when indexed object size grows (data uploads and run artifacts).

1. Compute size delta: `newSize - previousSize`.
2. If delta is positive, convert to cents:
   - `deltaGiB = sizeDeltaBytes / (1024^3)`
   - `deltaCents = max(minimumChargeCents, ceil(deltaGiB * storageGiBDeltaRateCents))`
   - apply debit (`storage_charge`)
3. If delta is zero or negative, do nothing.

Behavior:

- On insufficient credits for a positive storage delta, operation fails with `insufficient credits`.
- For data upload callback path, uploaded object cleanup is attempted (best effort) on post-upload ledger failure.
- There is currently no automatic storage refund path.

## Invariants

- Identity source of truth is Better Auth; ledger is keyed by `userId`.
- `userCredits` is current state.
- `usageEvents` is append-only audit history.
- Every balance mutation is paired with a usage event.
- Balances are integer cents only.

## Known Limits (Current Implementation)

- No payment provider/bank integration.
- No automatic top-up/checkout.
- Compute settlement is reservation-based right now:
  - reserve at create
  - no automatic refund path yet
  - no duration-based post-run overage/refund yet for started runs.
