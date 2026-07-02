# Spec: Stripe Prepaid Credits

## Scope

Tahuna Cloud uses Stripe Checkout for prepaid credit top-ups.

This is the hosted managed-billing path. Users pay Tahuna, Tahuna credits fund hosted compute, and Tahuna manages provider credentials, provider usage, and provider payment.

## MVP Behavior

- Users add Tahuna credits through Stripe Checkout.
- Supported fixed top-ups: `$10`, `$25`, `$100`.
- Custom top-up amounts are supported within configured bounds.
- `$1 paid = $1 Tahuna credit`.
- Training compute-session launch requires a one-hour credit reserve before provider provisioning.
- Serve launch uses the existing serve launch estimate until serving migrates to compute sessions.
- Hosted training compute sessions and serves are managed by Tahuna only; users do not choose a compute billing mode.
- No Stripe Billing Portal for MVP.
- No refund, dispute, or chargeback automation for MVP.

## Managed Billing

Managed billing is the only Tahuna Cloud path.

- User pays Tahuna through Stripe.
- Tahuna credits fund hosted compute.
- Tahuna owns and uses the provider credentials.
- Tahuna pays the compute provider.
- Tahuna records user-facing payment history from Stripe payment records.
- Tahuna records training compute-session debits and serve compute debits in the credit ledger.
- Provider-side balance, quota, credential, and capacity failures are Tahuna operational failures.

## Configuration

Convex environment variables:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
TAHUNA_MANAGED_RUNPOD_API_KEY=...
```

During development, the managed provider key may point at the developer's provider account. In production, it must be a Tahuna-owned provider key with operational monitoring, spend controls, and quota management.

Stripe mode pairing is mandatory:

| Environment | Secret key | Webhook secret |
| --- | --- | --- |
| Dev/test | `sk_test_...` | Test-mode endpoint `whsec_...` |
| Production | `sk_live_...` | Live-mode endpoint `whsec_...` |

Webhook signing secrets are per Stripe webhook endpoint. Dev and production must use separate endpoints and separate `whsec_...` values.

## Webhook Endpoint

Stripe sends Checkout events to the Convex HTTP endpoint:

```text
https://<convex-deployment>.convex.site/stripe/webhook
```


Subscribed events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
```

Only successful payment events fulfill credits. Failed and expired events update checkout state only.

## Data Ownership

Stripe payment records and credit ledger events are separate concerns.

`stripeCheckoutSessions` stores payment/top-up records:

- local checkout record,
- Stripe Checkout Session ID,
- Stripe PaymentIntent ID when available,
- amount paid,
- credits granted,
- checkout status,
- fulfilled timestamp.

`usageEvents` stores credit ledger events:

- starter grants,
- Stripe credit grants,
- compute-session reservations,
- compute charges,
- settlement refunds,
- storage charges.

Billing payment history must read from `stripeCheckoutSessions`, not `usageEvents`. It should show actual payments made to Tahuna only.

Audit logs may read from `usageEvents` because that surface is for ledger and operational activity.

## Fulfillment Flow

1. Billing UI requests a top-up checkout session.
2. Backend creates a `stripeCheckoutSessions` row.
3. Backend creates a Stripe Checkout Session with inline `price_data`.
4. User completes Checkout on Stripe.
5. Stripe calls `/stripe/webhook`.
6. Webhook verifies `stripe-signature` with `STRIPE_WEBHOOK_SECRET`.
7. Webhook retrieves the Checkout Session and validates:
   - paid/no-payment-required status,
   - expected amount,
   - expected currency.
8. Backend grants credits through the ledger:
   - `eventType = stripe_top_up`,
   - `creditsDeltaCents = paid amount cents`,
   - `idempotencyKey = stripe:checkout:<sessionId>`.
9. Backend marks the checkout session `fulfilled`.

Open or pending checkout sessions are not payments and must not appear as payment history.

## Provider Boundary

Stripe credits are Tahuna account credits. They do not add funds to a user's external provider account.

For hosted training compute sessions, Tahuna must enforce its own one-hour reservation check before provider provisioning and must use Tahuna-owned provider credentials. For hosted serves, Tahuna must enforce the existing serve launch estimate until serving migrates to compute sessions. Provider-side failures should surface as managed compute operational failures.

## Not In MVP

- Stripe Billing Portal.
- Saved payment methods management.
- Auto top-up.
- Refund and dispute credit reversal.
- Invoice/receipt export inside Tahuna.
- Payment reconciliation reports.
