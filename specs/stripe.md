# Spec: Stripe Prepaid Credits

## Scope

Tahuna uses Stripe Checkout for prepaid credit top-ups.

This is a hosted Tahuna billing path. It is separate from compute-provider BYOK credentials.

## MVP Behavior

- Users add Tahuna credits through Stripe Checkout.
- Supported fixed top-ups: `$10`, `$25`, `$100`.
- Custom top-up amounts are supported within configured bounds.
- `$1 paid = $1 Tahuna credit`.
- Run launch requires estimated Tahuna funds before provisioning.
- No Stripe Billing Portal for MVP.
- No refund, dispute, or chargeback automation for MVP.

## Configuration

Convex environment variables:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Mode pairing is mandatory:

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

Current dev endpoint:

```text
https://healthy-monitor-735.convex.site/stripe/webhook
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
- run reservations,
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

## BYOK Compute Provider Boundary

Tahuna currently provisions compute through user-provided provider credentials, such as a RunPod API key.

There is no direct technical conflict between Stripe prepaid credits and BYOK provider credentials, but the product boundary must stay explicit:

- Stripe credits are Tahuna account credits.
- BYOK credentials authorize provisioning against the user's compute-provider account.
- Paying Tahuna does not add funds to the user's RunPod/provider account.
- Tahuna credits do not replace the provider API key.
- If a provider rejects provisioning because of provider-side balance, quota, or credential issues, Stripe credit alone does not fix that failure.

For hosted runs, Tahuna should still enforce its own estimated-funds check before launch. Provider-side failures remain a separate provisioning error path.

## Not In MVP

- Stripe Billing Portal.
- Saved payment methods management.
- Auto top-up.
- Refund and dispute credit reversal.
- Invoice/receipt export inside Tahuna.
- Payment reconciliation reports.
