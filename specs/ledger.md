# Spec: User Credits Ledger

## Transparency Principles (Keep These)

1. Pricing inputs and formulas must be explicit.
2. Every balance change must be explainable from persisted records.
3. Ledger rows must be user-readable (event, amount, reference, timestamp).
4. Edge cases (insufficient credits, cancel/fail, refunds) must have explicit behavior.
5. Docs must separate "implemented now" vs "not handled yet".

## Current Scope

This is prepaid credits accounting with Stripe funding:

- One ledger balance per Better Auth user (`userCredits`).
- Ledger events in `usageEvents`.
- Real-time compute debits while a run or serve is active.
- Storage growth debits.
- Prepaid Stripe Checkout top-ups.
- Billing UI reads balance + ledger history from Convex.
- Hosted compute is managed by Tahuna.

## Identity Source of Truth

- User identity comes from Better Auth.
- Ledger rows are keyed by canonical `userId`.
- API key auth resolves to the same `userId`.

## Data Model

`userCredits` (current balance):

- `userId`
- `balanceCents`
- `currency`
- `createdAt`, `updatedAt`

`usageEvents` (ledger events):

- `userId`
- `eventType`
- `creditsDeltaCents` (positive=credit, negative=debit)
- `balanceAfterCents`
- `idempotencyKey` (optional)
- `referenceType`, `referenceId` (optional)
- `metadata` (optional)
- `createdAt`

Stripe payment records:

- `stripeCheckoutSessions`: local checkout/top-up records, Stripe session IDs, paid/fulfilled state.

## Config Used Today

From `web/cloud/config.ts`:

- `currency = "USD"`
- `initialCreditCents = 500` (USD 5.00)
- `computeVolumeGbHourlyRateCents = 2`
- `storageGiBDeltaRateCents = 3`
- `minimumChargeCents = 1`

GPU hourly inputs come from `web/cloud/providers/runpod-gpu-pricing.ts` (strict mapping, no fallback). Run creation and compute billing fail when a positive-GPU run has no mapped hourly price.

## Balance Initialization

On first authenticated usage:

1. Create `userCredits` row if missing.
2. Set `balanceCents = initialCreditCents`.
3. Insert `usageEvents` row:
   - `eventType = initial_grant`
   - `creditsDeltaCents = +initialCreditCents`

## Compute Billing (Implemented Now)

Compute billing applies to hosted managed runs and serves. Tahuna-owned provider credentials authorize provisioning, and Tahuna credits are debited for compute usage.

### Pricing Formula

For each run or serve:

- `hourlyRateCents = gpuCount * gpuTypeHourlyRateCents + volumeGb * computeVolumeGbHourlyRateCents`
- `targetChargeCents = max(minimumChargeCents, ceil(hourlyRateCents * uptimeMs / 3600000))` once uptime > 0

### Real-Time Debit Path

Crons in `web/convex/crons.ts` call hosted billing mutations once per minute for active runs and serves.

Per active compute resource:

1. Compute `targetChargeCents` from uptime.
2. Upsert one live debit ledger entry using idempotency key:
   - `run:<runId>:live_debit` or `serve:<serveId>:live_debit`
3. Ledger upsert function (`upsertLedgerDebitTotal`):
   - reads the existing live debit total for that resource,
   - computes incremental delta to reach target,
   - deducts only that incremental delta from `userCredits.balanceCents`,
   - updates the same `usageEvents` row (no minute-by-minute row fanout).
4. Update run compute fields:
   - `computeChargeCents`
   - `computeCollectedCents`
   - `computeOutstandingCents`
   - `computeChargeStatus` (`pending|charged|owed`)
   - `computeChargeError` when owed/invalid pricing

### Terminal Reconciliation

On terminal transitions, settlement runs through the shared compute settlement helper:

- If remaining debit exists, apply settlement debit.
- If over-collected, apply settlement refund.
- If still not collectible, mark owed.

This keeps final run charge aligned with terminal runtime duration.

## Storage Billing (Implemented Now)

On positive storage size delta:

- `deltaGiB = sizeDeltaBytes / (1024^3)`
- `deltaCents = max(minimumChargeCents, ceil(deltaGiB * storageGiBDeltaRateCents))`
- post `storage_charge` debit

No charge on zero/negative size delta.

## Stripe Top-Ups (Implemented Now)

Tahuna uses prepaid credit purchase through Stripe Checkout:

1. Dashboard billing creates a Checkout Session for a fixed top-up (`$10`, `$25`, `$100`) or custom amount.
2. `stripeCheckoutSessions` stores the local pending checkout record.
3. Stripe redirects back to `/dashboard?view=billing` after checkout.
4. `/stripe/webhook` verifies the Stripe signature and processes:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - failure/expiry events for status only
5. Successful fulfillment grants user credits through the normal ledger helper:
   - `eventType = stripe_top_up`
   - `creditsDeltaCents = paid amount cents`
   - `idempotencyKey = stripe:checkout:<sessionId>`

MVP policy:

- `$1 paid = $1 credit`.
- No Billing Portal.
- No automatic refund or dispute reversal handling.
- Custom top-ups are bounded by `minimumTopUpAmountCents` and `maximumTopUpAmountCents`.
- Run and serve launch require at least the configured launch estimate, currently one hour of estimated compute cost.

## What Users See Today

Billing page shows:

- current account balance (`getMyCredits`),
- ledger history (`listMyUsageEvents`),
- event details including run or serve metadata.

Users should not choose a compute billing mode in Tahuna Cloud. Billing UX should present one path: add credits, launch managed runs or serves, and inspect credit/payment history.

## Current Invariants

- Balance is integer cents.
- Real-time balance is ledger-backed (`userCredits.balanceCents`).
- Compute live debit uses one mutable ledger row per active run or serve, not one row per minute.
- Settlement/refund/owed logic still exists for terminal reconciliation.

## Not Handled Yet

1. Immutable compute audit trail while run is active:
- Live compute debit row is updated in place (same idempotency key), so minute-by-minute snapshots are not preserved as separate immutable rows.

2. Pricing catalog governance:
- GPU pricing is code-defined static mapping, not a versioned catalog with effective dates.

3. Pre-run cost quote UX:
- Backend launch gating uses the configured estimate, but there is no explicit pre-launch quote/acceptance flow with locked pricing version.

4. Debt/arrears policy:
- Owed status exists, but product policy for debt recovery, hard-stop thresholds, and enforcement is still partial.

5. Stripe refund/dispute handling:
- No automated credit reversal or debt handling for refunds, chargebacks, or disputes.

6. Reconciliation tooling:
- No dedicated periodic reconciliation job/report that verifies `userCredits` against ledger totals and run charges.

7. Billing artifacts:
- Stripe receipts may exist externally, but Tahuna has no in-app invoices/receipts exports for accounting workflows.

8. Ledger UX v2:
- No filters by reference/event type, no export, no long-history pagination UX.

## Design Tradeoff (Explicit)

Current compute design optimizes for user clarity and runtime efficiency:

- Pros: real-time balance updates, single line per run in ledger history, no row fanout.
- Cons: active-run ledger line is mutable (not fully append-only minute history).

If strict immutable event sourcing is required later, add a separate append-only accrual table and keep UI aggregation per run.
