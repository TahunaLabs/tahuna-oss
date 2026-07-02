# Spec: User Credits Ledger

## Transparency Principles (Keep These)

1. Pricing inputs and formulas must be explicit.
2. Every balance change must be explainable from persisted records.
3. Ledger rows must be user-readable (event, amount, reference, timestamp).
4. Edge cases (insufficient credits, cancel/fail, refunds) must have explicit behavior.
5. Docs must separate "implemented now" vs "not handled yet".

## Status

This document describes the accepted ledger model for hosted billing. Current implementation gaps are listed in **Not Handled Yet**.

## Current Scope

This is prepaid credits accounting with Stripe funding:

- One ledger balance per Better Auth user (`userCredits`).
- Ledger events in `usageEvents`.
- Training compute debits keyed to `computeSessions`.
- Serving compute debits keyed to `serves` until serving migrates to compute sessions.
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

Compute reservations:

- Active compute reservations reduce available credits but do not debit the ledger upfront.
- The canonical reservation owner for training is the `computeSessions` row.
- A reservation is released when the compute session reaches a terminal state and final settlement has run.
- Ledger debits still represent collected usage, not held funds.

## Config Used Today

From `web/cloud/config.ts`:

- `currency = "USD"`
- `initialCreditCents = 0` (USD 0.00)
- `computeVolumeGbHourlyRateCents = 2`
- `storageGiBDeltaRateCents = 3`
- `minimumChargeCents = 1`

GPU hourly inputs come from `web/cloud/providers/runpod-gpu-pricing.ts` (strict mapping, no fallback). Training compute-session creation and compute billing fail when a positive-GPU runtime has no mapped hourly price.

## Balance Initialization

On first authenticated usage:

1. Create `userCredits` row if missing.
2. Set `balanceCents = initialCreditCents`.
3. If `initialCreditCents > 0`, insert `usageEvents` row:
   - `eventType = initial_grant`
   - `creditsDeltaCents = +initialCreditCents`

## Training Compute Billing

Training compute billing applies to hosted managed compute sessions. Tahuna-owned provider credentials authorize provisioning, and Tahuna credits are debited for provider-machine uptime.

The compute session is the billing source of truth for training:

- `computeSessions` owns provider machine lifetime, runtime token, runtime spec snapshot, liveness, idle policy, termination, reservation, and compute billing.
- `runs` own run ID, status, logs, metrics, artifacts, terminal result, and pinned manifests.
- One-shot training runs may display the attached compute-session charge through the run UI/API, but the ledger reference remains the compute session.
- Warm-session idle spend remains on the compute session. It must not be silently spread across attached runs.

### Pricing Formula

For each compute session:

- `hourlyRateCents = gpuCount * gpuTypeHourlyRateCents + volumeGb * computeVolumeGbHourlyRateCents`
- `targetChargeCents = max(minimumChargeCents, ceil(hourlyRateCents * uptimeMs / 3600000))` once uptime > 0

`computeStartedAt` is set when the provider machine is provisioned. Billing includes provider startup, image pull, runtime bootstrap, active run execution, and warm idle time because Tahuna pays the provider for that machine lifetime.

`computeEndedAt` is set when provider termination succeeds or when termination failure is finalized.

### Launch Admission And One-Hour Reserve

Training compute session provisioning is prepaid and reserve-gated:

1. Resolve the runtime spec and hourly price before provider provisioning.
2. Compute `requiredReserveCents = max(minimumChargeCents, hourlyRateCents)`.
3. Compute `availableBalanceCents = userCredits.balanceCents - activeComputeReservationCents`.
4. If `availableBalanceCents < requiredReserveCents`, reject the launch before creating or provisioning a provider machine.
5. If enough credits exist, attach a one-hour reservation to the compute session.

The reservation is a hold against available credits, not an upfront debit. Users are charged by usage accrual, not by reservation creation. The reservation exists to prevent users from launching or keeping alive compute that is not prepaid.

One-shot compute sessions also reserve one hour. They still terminate immediately after their assigned run reaches a terminal state; unused reserved credit becomes available again after final settlement.

Warm compute sessions reserve one hour for the machine lifetime, including idle time. Every run attached to a warm session shares the same session reservation.

### Live Debit Path

Crons in `web/convex/crons.ts` call hosted training billing once every 5 minutes for active compute sessions.

Per active compute session:

1. Compute `targetChargeCents` from uptime.
2. Upsert one live debit ledger entry using idempotency key:
   - `compute_session:<computeSessionId>:live_debit`
3. Ledger upsert function (`upsertLedgerDebitTotal`):
   - reads the existing live debit total for that resource,
   - computes incremental delta to reach target,
   - deducts only that incremental delta from `userCredits.balanceCents`,
   - updates the same `usageEvents` row (no minute-by-minute row fanout).
4. Update compute-session billing fields:
   - `computeChargeCents`
   - `computeCollectedCents`
   - `computeOutstandingCents`
   - `computeChargeStatus` (`pending|charged|owed`)
   - `computeChargeError` when owed/invalid pricing

If the ledger cannot collect the full target charge, the compute session must immediately transition toward provider termination with reason `insufficient_credits`. The system may record owed cents for accounting, but owed status is not permission to keep the provider machine alive.

### Terminal Reconciliation

On terminal compute-session transitions, settlement runs through the shared compute settlement helper:

- If remaining debit exists, apply settlement debit.
- If over-collected, apply settlement refund.
- If still not collectible, mark owed.

This keeps the final compute-session charge aligned with provider-machine duration.

For one-shot training, the final compute-session charge may be mirrored onto the attached run for compatibility with existing run summaries. The ledger reference remains `referenceType = "compute_session"`.

## Serving Compute Billing

Serving remains on the existing serve-specific lifecycle and billing path until the serving compute-session migration.

Current serve billing rules:

- Serve launch uses the configured launch estimate gate.
- Live serving compute debits are keyed by `serve:<serveId>:live_debit`.
- Ledger references remain `referenceType = "serve"`.
- Serve lifecycle, inference proxying, runtime callbacks, and serve billing are not changed by the training compute-session model.

Future serving migration:

- A serve should eventually run on top of a compute session.
- The compute session should own provider-machine lifetime, reservation, and compute billing.
- The serve should own serving identity, health/readiness, routing, inference proxying, model snapshot, logs, and user-facing serve status.
- That migration requires a separate design because serving is long-lived and request-addressable.

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
- Training compute session launch requires a one-hour runtime reserve before provider provisioning.
- Serve launch still uses the existing serve launch estimate until serving migrates to compute sessions.

## What Users See Today

Billing page shows:

- current account balance (`getMyCredits`),
- ledger history (`listMyUsageEvents`),
- event details including compute-session, run, or serve metadata.

Users should not choose a compute billing mode in Tahuna Cloud. Billing UX should present one path: add credits, launch managed runs or serves, and inspect credit/payment history.

## Current Invariants

- Balance is integer cents.
- Real-time balance is ledger-backed (`userCredits.balanceCents`).
- Training compute live debit uses one mutable ledger row per active compute session, not one row per billing tick.
- Serving compute live debit uses one mutable ledger row per active serve until serving migrates to compute sessions.
- Settlement/refund/owed logic still exists for terminal reconciliation.
- Active compute reservations reduce available balance but do not change ledger balance until usage is actually collected.

## Not Handled Yet

1. Immutable compute audit trail while compute is active:
- Live compute debit row is updated in place (same idempotency key), so minute-by-minute snapshots are not preserved as separate immutable rows.

2. Pricing catalog governance:
- GPU pricing is code-defined static mapping, not a versioned catalog with effective dates.

3. Pre-run cost quote UX:
- Backend launch gating uses the configured estimate, but there is no explicit pre-launch quote/acceptance flow with locked pricing version.

4. Stripe refund/dispute handling:
- No automated credit reversal or debt handling for refunds, chargebacks, or disputes.

5. Reconciliation tooling:
- No dedicated periodic reconciliation job/report that verifies `userCredits` against ledger totals and run charges.

6. Billing artifacts:
- Stripe receipts may exist externally, but Tahuna has no in-app invoices/receipts exports for accounting workflows.

7. Ledger UX v2:
- No filters by reference/event type, no export, no long-history pagination UX.

## Design Tradeoff (Explicit)

Current compute design optimizes for user clarity and runtime efficiency:

- Pros: real-time balance updates, single line per compute session or serve in ledger history, no row fanout.
- Cons: active compute ledger line is mutable (not fully append-only tick history).

If strict immutable event sourcing is required later, add a separate append-only accrual table and keep UI aggregation per run.
