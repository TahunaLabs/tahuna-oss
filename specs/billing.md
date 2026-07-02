# Spec: Compute Billing And Credit Enforcement

## Scope

This is the target billing policy for Tahuna Cloud hosted compute.

The ledger accounting model lives in `specs/ledger.md`. This document defines the product and lifecycle rules that decide when compute can be provisioned, how active compute is charged, and when compute must be terminated because credits are exhausted.

## Principles

1. Tahuna is prepaid by default. A user must have enough available credits before Tahuna creates provider compute.
2. Provider-machine lifetime is the billable unit for dedicated GPU compute.
3. Training compute billing is keyed to `computeSessions`, not `runs`.
4. Active compute must never continue intentionally after credits are exhausted.
5. Warm-session idle time is real provider spend and remains charged to the compute session.
6. Ledger debits represent collected usage. Reservations are holds against available credits, not charges.
7. The target architecture is that all provider compute runs on top of `computeSessions`; serving is the next migration after training.

## Billing Subjects

### Training

Training runs live on top of compute sessions.

The `computeSessions` row owns:

- provider machine ID
- runtime token
- runtime spec snapshot
- liveness and heartbeat state
- idle policy
- termination
- credit reservation
- compute billing

The `runs` row owns:

- run ID
- run status
- logs
- metrics
- artifacts
- terminal result
- pinned code/data manifests

One-shot training creates one compute session and one run. The run may display the session charge for user-facing compatibility, but the ledger reference remains the compute session.

Warm training creates one compute session that can execute multiple runs sequentially. The compute session owns the full provider-machine charge, including idle time between runs.

### Serving

Serving runs on top of compute sessions:

- the compute session owns provider-machine lifetime, runtime token, runtime spec snapshot, reservation, termination, and compute billing
- the serve owns serving identity, health/readiness, routing, inference proxying, model snapshot, logs, and user-facing status
- serve launch is rejected before provider provisioning unless available credits cover the one-hour compute-session reserve
- serving compute sessions are billed every 5 minutes from exact provider-machine uptime
- live debit idempotency keys use `compute_session:<computeSessionId>:live_debit`
- ledger references use `referenceType = "compute_session"` and `referenceId = <computeSessionId>`
- if credits are no longer sufficient during live billing, the compute session terminates with reason `insufficient_credits` and the serve transitions to a terminal/unavailable state with a user-readable billing error

## Credit Balance Terms

`ledgerBalanceCents`

- The current persisted credit balance from `userCredits.balanceCents`.
- Changes only through ledger credit/debit/refund events.

`activeReservationCents`

- The remaining held credits for active compute sessions.
- Does not change ledger balance directly.
- Prevents the same credits from launching multiple machines.

`availableBalanceCents`

```text
availableBalanceCents = ledgerBalanceCents - sum(activeReservationCents for active compute)
```

Only available balance can be used for new compute reservations.

## One-Hour Launch Reserve

Before provisioning a training compute session, Tahuna must reserve one hour of the selected runtime.

```text
hourlyRateCents =
  gpuCount * gpuTypeHourlyRateCents
  + volumeGb * computeVolumeGbHourlyRateCents

requiredReserveCents = max(minimumChargeCents, hourlyRateCents)
```

Launch flow:

1. Resolve and validate the runtime spec.
2. Resolve the hourly price from the pricing catalog.
3. Read ledger balance and active reservations.
4. Compute available balance.
5. If available balance is less than the one-hour reserve, reject before provider provisioning.
6. If available balance is sufficient, create the compute session with the reserve attached.
7. Provision the provider machine.

The one-hour reserve is RunPod-style strictness. It is not a promise that the user will be charged for one hour. It is permission to launch one hour of prepaid compute.

If a one-shot run finishes in 8 minutes, the final charge is 8 minutes of uptime, rounded by the normal formula, and the unused reservation is released.

## Reservation Consumption

The reservation is consumed as actual compute charges are collected.

```text
reservationRemainingCents =
  max(0, requiredReserveCents - computeCollectedCents)
```

That means:

- at launch, a one-hour session holds one hour of credits
- as live billing collects real usage, the remaining hold shrinks
- once the session has collected one hour of charges, its original launch reserve is fully consumed
- if the session keeps running, future billing must be paid from unreserved ledger balance

This prevents a user from launching multiple one-hour machines with the same credits.

## Billing Cadence

Training compute sessions are billed every 5 minutes.

The billing tick does not define the price granularity. Each tick recomputes the cumulative target charge from exact uptime:

```text
targetChargeCents =
  max(minimumChargeCents, ceil(hourlyRateCents * uptimeMs / 3600000))
```

The live debit is one mutable ledger row per active compute session:

```text
idempotencyKey = compute_session:<computeSessionId>:live_debit
referenceType = compute_session
referenceId = <computeSessionId>
```

On each tick:

1. Load active compute sessions.
2. Compute exact uptime from `computeStartedAt` to now.
3. Compute cumulative target charge.
4. Debit only the delta needed to reach the target.
5. Update compute-session billing fields.
6. Update the session reservation remaining amount.
7. If the full delta cannot be collected, terminate the session for insufficient credits.

The maximum normal exposure is one billing interval plus provider termination latency. The one-hour launch reserve keeps that exposure bounded and prevents parallel oversubscription.

## Insufficient Credits

If live billing cannot collect the full target charge for a compute session, the compute session must immediately stop accepting work and transition toward provider termination.

Required behavior:

1. Set `computeChargeStatus = "owed"`.
2. Set `computeOutstandingCents` to the uncollected amount.
3. Set `computeChargeError` to an insufficient-credit detail.
4. Clear `environments.activeComputeSessionId` if it points to the session.
5. Mark or transition the compute session to `terminating`.
6. Request provider machine termination.
7. Record the termination reason as `insufficient_credits`.
8. If a run is active, move it to a terminal failure/cancelled state with a user-readable insufficient-credit error.

Owed status is an accounting state, not permission to keep running compute.

## One-Shot Training

Plain `tahuna train` and `tahuna run create` use a one-shot compute session.

Lifecycle:

1. Reserve one hour.
2. Create compute session.
3. Create one attached run.
4. Provision provider machine.
5. Bill compute session every 5 minutes.
6. When the run reaches terminal state, terminate the session immediately.
7. Settle final compute-session charge.
8. Release unused reservation.
9. Display the final charge through the run where existing APIs need it.

One-shot sessions must not set `environments.activeComputeSessionId`.

## Warm Training

`tahuna train --keep-warm-minutes <n>` creates a warm compute session and attaches the baseline run.

`tahuna train --warm` attaches a new run to the existing active warm session.

Billing rules:

- The compute session owns the full charge for the provider machine lifetime.
- Idle warm time is charged to the compute session.
- Idle warm spend is not spread silently across runs.
- Each attached run can show active execution time for explanation, but the ledger remains session-scoped.
- The session continues billing until provider termination, even when no run is active.

Termination triggers:

- idle timeout
- heartbeat timeout
- runtime spec invalidation
- user stop/delete
- replacement by a newer warm session
- insufficient credits

## Audit Log And Dashboard Display

Audit logs should make the compute-session billing grain visible.

For one-shot sessions:

- show the training compute settlement as a compute-session debit
- include the attached run name when available
- show the full compute-session uptime

For warm sessions:

- show the compute-session debit as one session-level event
- show total uptime
- show attached run count and run names where practical
- show idle time as session idle spend, not run spend

The dashboard can still show run-level summaries for user convenience. Those summaries must be derived from compute-session records and must not create duplicate ledger debits.

## Storage Billing

Storage billing remains separate from compute-session billing.

Storage events should continue to debit the ledger by storage delta or storage policy. They do not consume compute reservations.

## Stripe Top-Ups

Stripe top-ups add credits to the ledger.

Adding credits may allow:

- new compute-session launches that were previously rejected
- active compute sessions to keep billing if they have not already been terminated
- owed balances to be reconciled by a later recovery process

The MVP does not require auto top-up. Auto top-up can be added later as a user-configured way to avoid insufficient-credit termination.

## Implementation Notes

Required training implementation changes:

1. Store a one-hour reservation on each active training compute session.
2. Compute available balance as ledger balance minus active reservation remainder.
3. Gate compute-session provisioning on available balance, not raw ledger balance.
4. Change training compute billing cron cadence to 5 minutes.
5. Keep live debit idempotency keyed to compute session.
6. Terminate compute sessions immediately when live billing cannot collect the full target delta.
7. Mark active runs terminal when their session terminates for insufficient credits.
8. Release unused reservation during terminal settlement.

Serving compute-session migration is complete:

1. Serves have backing compute sessions.
2. Provider-machine lifetime, runtime token, reservation, billing, and termination live on `computeSessions`.
3. Serve compute-session creation uses the same one-hour available-credit reserve as training.
4. Serving compute sessions bill every 5 minutes with compute-session live debit idempotency keys and ledger references.
5. Insufficient credits terminate serving compute sessions with reason `insufficient_credits`.
6. Inference proxying, health, readiness, routing, and model snapshot ownership remain on `serves`.
7. Existing serve API compatibility and inference URLs are preserved.

## Non-Goals

- Postpaid billing.
- Monthly invoices as the primary credit control.
- Letting active compute intentionally run into arrears.
- Smearing warm idle cost across runs.
- Migrating serving to compute sessions in the same pass as training credit enforcement.

## Acceptance Criteria

- A training compute session cannot be provisioned unless the user has enough available credits for one hour of the selected runtime.
- Active reservations prevent the same balance from launching multiple sessions.
- Training compute sessions are billed every 5 minutes from exact uptime.
- If a compute-session live debit cannot collect the full target charge, the session transitions to terminating with reason `insufficient_credits`.
- One-shot sessions terminate after the attached run reaches terminal state.
- Warm sessions keep billing while idle until timeout or termination.
- Warm idle spend stays on the compute session.
- Run summaries may display derived charges, but run ledger debits are not the source of truth for training compute.
- Current serving behavior remains unchanged until its compute-session migration.
- After serving migration, serving provider-machine lifetime, billing, reservations, 5-minute live polling, and insufficient-credit termination are compute-session-owned.
