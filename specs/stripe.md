# Spec: Stripe Prepaid Credits

## Scope

Tahuna uses Stripe Checkout for prepaid credit top-ups.

This is the hosted managed-billing path. In this mode, users pay Tahuna and Tahuna manages provider credentials, provider usage, and provider payment.

## MVP Behavior

- Users add Tahuna credits through Stripe Checkout.
- Supported fixed top-ups: `$10`, `$25`, `$100`.
- Custom top-up amounts are supported within configured bounds.
- `$1 paid = $1 Tahuna credit`.
- Run launch requires estimated Tahuna funds before provisioning.
- Managed billing and BYOK cannot both fund the same run.
- No Stripe Billing Portal for MVP.
- No refund, dispute, or chargeback automation for MVP.

## Billing Modes

Tahuna should model compute funding as an explicit billing mode:

```ts
type BillingMode = "managed" | "byok";
```

### Managed Billing

Managed billing is the Stripe credits path.

- User pays Tahuna through Stripe.
- Tahuna credits fund hosted compute.
- Tahuna owns and uses the provider credentials.
- Tahuna pays the compute provider.
- Tahuna records user-facing payment history from Stripe payment records.
- Tahuna records compute debits and settlements in the credit ledger.

Managed billing is the default cloud product direction.

### BYOK

BYOK means bring your own provider account/key.

- User provides the compute-provider credential, such as a RunPod API key.
- User pays the provider directly.
- Tahuna orchestrates provisioning, but does not fund provider compute with Tahuna credits.
- Tahuna must not debit Tahuna credits for provider compute usage in this mode.
- Provider-side balance, quota, and credential failures remain provider errors.

BYOK can exist as an advanced, legacy, or self-managed mode, but it must be explicit.

### Non-Mixing Rule

One run must have exactly one compute billing mode.

Valid:

- `managed`: require estimated Tahuna funds, provision with Tahuna-owned provider credentials, debit Tahuna credits.
- `byok`: require user provider credentials, provision against the user's provider account, do not debit Tahuna credits for provider compute.

Invalid:

- Requiring user provider credentials while also charging Tahuna credits for provider compute.
- Showing Stripe credits as if they fund the user's external provider account.
- Falling back from managed billing to BYOK implicitly.
- Falling back from BYOK to managed billing implicitly.

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

Current code still has BYOK-oriented provider credential flows. Stripe credits do not make those flows equivalent to managed billing.

The product boundary must stay explicit:

- Stripe credits are Tahuna account credits.
- In managed billing, Tahuna-owned provider credentials authorize provisioning.
- In BYOK, user-owned provider credentials authorize provisioning against the user's compute-provider account.
- Paying Tahuna does not add funds to the user's RunPod/provider account.
- Tahuna credits do not replace a provider API key in BYOK mode.
- If BYOK provisioning fails because of provider-side balance, quota, or credential issues, Stripe credit alone does not fix that failure.

For hosted managed runs, Tahuna should enforce its own estimated-funds check before launch and should use Tahuna-owned provider credentials. Provider-side failures are then Tahuna operational failures, not user BYOK balance failures.

## Not In MVP

- Stripe Billing Portal.
- Saved payment methods management.
- Auto top-up.
- Refund and dispute credit reversal.
- Invoice/receipt export inside Tahuna.
- Payment reconciliation reports.
