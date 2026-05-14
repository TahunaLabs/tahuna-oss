import { ConvexError, v } from "convex/values";
import type { Doc } from "@convex/_generated/dataModel";
import { internal } from "@convex/_generated/api";
import type { ActionCtx, MutationCtx } from "@convex/_generated/server";
import { action, httpAction, internalMutation, mutation, query } from "@convex/_generated/server";
import Stripe from "stripe";
import { CLOUD_BILLING_CONFIG } from "@/cloud/config";
import { NETWORK_CONFIG } from "@convex/appConfig";
import { authComponent, requireUser } from "@convex/auth";
import {
  ensureUserLedger,
  grantUserCredits,
  upsertLedgerDebitTotal,
  USAGE_EVENT_TYPE,
} from "@convex/cloud/credits";
import { BILLING_MODE, runBillingMode } from "@convex/core/billingMode";
import {
  estimateRunUsageFromHourlyRateCents,
  resolveRunHourlyRateCents,
  resolveTerminalRunTiming,
  runLiveDebitIdempotencyKey,
  settleRunComputeCharge,
  toUnixMillis,
  type ComputeSettlementResult,
} from "@convex/cloud/runBilling";
import { RUN_STATUS } from "@convex/runsConstants";

const STRIPE_CHECKOUT_PAYMENT_STATUSES = new Set(["paid", "no_payment_required"]);

const HOSTED_BILLING_CLIENT_ERROR_PATTERNS: RegExp[] = [
  /\binsufficient credits\b/i,
];

export function isHostedBillingClientError(value: string) {
  return HOSTED_BILLING_CLIENT_ERROR_PATTERNS.some((pattern) => pattern.test(value));
}

export function hostedBillingHttpStatus(value: string, fallbackStatus: number) {
  return isHostedBillingClientError(value) ? 402 : fallbackStatus;
}

function stripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new ConvexError("stripe is not configured");
  }
  return new Stripe(secretKey);
}

function requireStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new ConvexError("stripe webhook secret is not configured");
  }
  return secret;
}

function normalizeSiteUrl() {
  const raw = process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || NETWORK_CONFIG.defaultApiUrl;
  return raw.replace(/\/+$/, "");
}

function normalizeTopUpAmountCents(value: number) {
  if (!Number.isFinite(value)) {
    throw new ConvexError("amount must be a finite number");
  }
  const amountCents = Math.floor(value);
  if (amountCents < CLOUD_BILLING_CONFIG.minimumTopUpAmountCents) {
    throw new ConvexError(`amount must be at least ${CLOUD_BILLING_CONFIG.minimumTopUpAmountCents} cents`);
  }
  if (amountCents > CLOUD_BILLING_CONFIG.maximumTopUpAmountCents) {
    throw new ConvexError(`amount must be at most ${CLOUD_BILLING_CONFIG.maximumTopUpAmountCents} cents`);
  }
  return amountCents;
}

function readUserEmail(user: unknown) {
  const email = typeof (user as { email?: unknown }).email === "string"
    ? (user as { email: string }).email.trim()
    : "";
  return email || undefined;
}

function stripeObjectId(value: unknown) {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return undefined;
}

function checkoutSessionPaymentIntentId(session: Stripe.Checkout.Session) {
  return stripeObjectId(session.payment_intent as string | Stripe.PaymentIntent | null);
}

export type HostedRunBillingPatch = {
  computeEndedAt?: number;
  computeChargeCents: number;
  computeCollectedCents: number;
  computeOutstandingCents: number;
  computeChargeStatus: "charged" | "owed";
  computeChargeError?: string;
};

export type HostedRunUsageSettlement = {
  patch: HostedRunBillingPatch;
  eventMetadata: Record<string, number | string | undefined>;
  terminalTiming: { computeEndedAt?: number; durationMs: number };
  settlement: ComputeSettlementResult;
};

export function initialHostedRunBillingFields(hourlyRateCents: number) {
  return {
    computeHourlyRateCents: hourlyRateCents,
    creditsReservedCents: 0,
    computeChargeCents: 0,
    computeCollectedCents: 0,
    computeOutstandingCents: 0,
    computeChargeStatus: "pending" as const,
  };
}

export async function settleHostedRunUsage(
  ctx: MutationCtx,
  row: Doc<"runs">,
): Promise<HostedRunUsageSettlement> {
  const terminalTiming = resolveTerminalRunTiming(row);
  const settlement = await settleRunComputeCharge(ctx, row, terminalTiming);
  return {
    patch: {
      computeEndedAt: terminalTiming.computeEndedAt,
      computeChargeCents: settlement.chargeCents,
      computeCollectedCents: settlement.collectedCents,
      computeOutstandingCents: settlement.outstandingCents,
      computeChargeStatus: settlement.chargeStatus,
      computeChargeError: settlement.chargeError,
    },
    eventMetadata: {
      duration_ms: terminalTiming.durationMs,
      compute_charge_cents: settlement.chargeCents,
      compute_charge_delta_cents: settlement.chargeDeltaCents,
      compute_charge_status: settlement.chargeStatus,
      compute_charge_error: settlement.chargeError,
      balance_after_cents: settlement.balanceAfterCents,
    },
    terminalTiming,
    settlement,
  };
}

export const getMyCredits = query({
  args: {},
  returns: v.object({
    balance_cents: v.number(),
    currency: v.string(),
    initialized: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const userId = String(user._id);
    const row = await ctx.db
      .query("userCredits")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!row) {
      return {
        balance_cents: 0,
        currency: CLOUD_BILLING_CONFIG.currency,
        initialized: false,
      };
    }
    return {
      balance_cents: row.balanceCents,
      currency: row.currency || CLOUD_BILLING_CONFIG.currency,
      initialized: true,
    };
  },
});

export const listMyUsageEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      event_type: v.string(),
      credits_delta_cents: v.number(),
      balance_after_cents: v.number(),
      reference_type: v.union(v.string(), v.null()),
      reference_id: v.union(v.string(), v.null()),
      metadata: v.union(v.any(), v.null()),
      created_at: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const userId = String(user._id);
    const rawLimit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : 100;
    const limit = Math.max(1, Math.min(200, rawLimit));
    const rows = await ctx.db
      .query("usageEvents")
      .withIndex("by_user_and_created_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      event_type: row.eventType,
      credits_delta_cents: row.creditsDeltaCents,
      balance_after_cents: row.balanceAfterCents,
      reference_type: row.referenceType ?? null,
      reference_id: row.referenceId ?? null,
      metadata: row.metadata ?? null,
      created_at: row.createdAt,
    }));
  },
});

export const listMyPaymentTransactions = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      amount_cents: v.number(),
      credits_cents: v.number(),
      currency: v.string(),
      stripe_checkout_session_id: v.union(v.string(), v.null()),
      stripe_payment_intent_id: v.union(v.string(), v.null()),
      created_at: v.number(),
      fulfilled_at: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("Not authenticated");
    }
    const userId = String(user._id);
    const rawLimit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.floor(args.limit) : 20;
    const limit = Math.max(1, Math.min(100, rawLimit));
    const rows = await ctx.db
      .query("stripeCheckoutSessions")
      .withIndex("by_user_status_and_created_at", (q) => q.eq("userId", userId).eq("status", "fulfilled"))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      amount_cents: row.amountCents,
      credits_cents: row.creditsCents,
      currency: row.currency,
      stripe_checkout_session_id: row.stripeCheckoutSessionId ?? null,
      stripe_payment_intent_id: row.stripePaymentIntentId ?? null,
      created_at: row.createdAt,
      fulfilled_at: row.fulfilledAt ?? null,
    }));
  },
});

export const ensureMyBillingAccount = mutation({
  args: {},
  returns: v.object({
    balance_cents: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const row = await ensureUserLedger(ctx, {
      userId: String(user._id),
      source: "dashboard_bootstrap",
    });
    return {
      balance_cents: row.balanceCents,
      currency: row.currency,
    };
  },
});

export const internalCreateStripeCheckoutSessionRecord = internalMutation({
  args: {
    userId: v.string(),
    amountCents: v.number(),
    creditsCents: v.number(),
    currency: v.string(),
  },
  returns: v.id("stripeCheckoutSessions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("stripeCheckoutSessions", {
      userId: args.userId,
      amountCents: args.amountCents,
      creditsCents: args.creditsCents,
      currency: args.currency,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const internalMarkStripeCheckoutSessionOpen = internalMutation({
  args: {
    checkoutRecordId: v.id("stripeCheckoutSessions"),
    stripeCheckoutSessionId: v.string(),
    checkoutUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.checkoutRecordId, {
      status: "open",
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      checkoutUrl: args.checkoutUrl,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const internalFailStripeCheckoutSessionRecord = internalMutation({
  args: {
    checkoutRecordId: v.id("stripeCheckoutSessions"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.checkoutRecordId, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const internalMarkStripeCheckoutSessionFailed = internalMutation({
  args: {
    stripeCheckoutSessionId: v.string(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("stripeCheckoutSessions")
      .withIndex("by_stripe_checkout_session_id", (q) =>
        q.eq("stripeCheckoutSessionId", args.stripeCheckoutSessionId),
      )
      .first();
    if (!row || row.status === "fulfilled") {
      return null;
    }
    await ctx.db.patch(row._id, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const internalFulfillStripeCheckoutSession = internalMutation({
  args: {
    stripeCheckoutSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    amountTotalCents: v.number(),
    currency: v.string(),
    paymentStatus: v.string(),
  },
  returns: v.object({
    fulfilled: v.boolean(),
    balance_cents: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    if (!STRIPE_CHECKOUT_PAYMENT_STATUSES.has(args.paymentStatus)) {
      return { fulfilled: false };
    }
    const row = await ctx.db
      .query("stripeCheckoutSessions")
      .withIndex("by_stripe_checkout_session_id", (q) =>
        q.eq("stripeCheckoutSessionId", args.stripeCheckoutSessionId),
      )
      .first();
    if (!row) {
      throw new ConvexError("stripe checkout session not found");
    }
    if (row.fulfilledAt) {
      return { fulfilled: false };
    }
    const amountTotalCents = Math.floor(args.amountTotalCents);
    if (amountTotalCents !== row.amountCents) {
      throw new ConvexError("stripe checkout amount mismatch");
    }
    if (args.currency.toUpperCase() !== row.currency.toUpperCase()) {
      throw new ConvexError("stripe checkout currency mismatch");
    }
    const credited = await grantUserCredits(ctx, {
      userId: row.userId,
      amountCents: row.creditsCents,
      eventType: USAGE_EVENT_TYPE.STRIPE_TOP_UP,
      idempotencyKey: `stripe:checkout:${args.stripeCheckoutSessionId}`,
      referenceType: "stripe_checkout_session",
      referenceId: args.stripeCheckoutSessionId,
      metadata: {
        stripe_payment_intent_id: args.stripePaymentIntentId,
        stripe_customer_id: args.stripeCustomerId,
        amount_cents: row.amountCents,
        credits_cents: row.creditsCents,
        currency: row.currency,
      },
    });
    if (!credited) {
      throw new ConvexError("stripe credit grant failed");
    }
    await ctx.db.patch(row._id, {
      status: "fulfilled",
      stripePaymentIntentId: args.stripePaymentIntentId,
      stripeCustomerId: args.stripeCustomerId || row.stripeCustomerId,
      fulfilledAt: Date.now(),
      updatedAt: Date.now(),
    });
    return {
      fulfilled: credited.applied,
      balance_cents: credited.balanceCents,
    };
  },
});

export const createTopUpCheckoutSession = action({
  args: {
    amount_cents: v.number(),
  },
  returns: v.object({
    checkout_session_id: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const userId = String(user._id);
    const email = readUserEmail(user);
    const amountCents = normalizeTopUpAmountCents(args.amount_cents);
    const currency = CLOUD_BILLING_CONFIG.currency;
    const stripe = stripeClient();

    const checkoutRecordId = await ctx.runMutation(internal.cloud.billing.internalCreateStripeCheckoutSessionRecord, {
      userId,
      amountCents,
      creditsCents: amountCents,
      currency,
    });

    const metadata = {
      user_id: userId,
      checkout_record_id: String(checkoutRecordId),
      credits_cents: String(amountCents),
    };
    const siteUrl = normalizeSiteUrl();
    try {
      const session = await stripe.checkout.sessions.create(
        {
          client_reference_id: String(checkoutRecordId),
          mode: "payment",
          ...(email ? { customer_email: email } : {}),
          success_url: `${siteUrl}/dashboard?view=billing&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${siteUrl}/dashboard?view=billing&checkout=cancelled`,
          line_items: [
            {
              price_data: {
                currency: currency.toLowerCase(),
                product_data: {
                  name: "Tahuna credits",
                },
                unit_amount: amountCents,
              },
              quantity: 1,
            },
          ],
          metadata,
          payment_intent_data: {
            metadata,
          },
        },
        { idempotencyKey: `tahuna:checkout:${checkoutRecordId}` },
      );
      if (!session.url) {
        throw new ConvexError("stripe checkout url is missing");
      }
      await ctx.runMutation(internal.cloud.billing.internalMarkStripeCheckoutSessionOpen, {
        checkoutRecordId,
        stripeCheckoutSessionId: session.id,
        checkoutUrl: session.url,
      });
      return {
        checkout_session_id: session.id,
        url: session.url,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "failed to create stripe checkout session";
      await ctx.runMutation(internal.cloud.billing.internalFailStripeCheckoutSessionRecord, {
        checkoutRecordId,
        error: detail,
      });
      throw error;
    }
  },
});

async function fulfillStripeCheckout(stripe: Stripe, ctx: ActionCtx, sessionId: string) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  return await ctx.runMutation(internal.cloud.billing.internalFulfillStripeCheckoutSession, {
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: checkoutSessionPaymentIntentId(session),
    stripeCustomerId: stripeObjectId(session.customer),
    amountTotalCents: session.amount_total ?? 0,
    currency: session.currency || CLOUD_BILLING_CONFIG.currency,
    paymentStatus: session.payment_status,
  });
}

export const stripeWebhook = httpAction(async (ctx, request) => {
  const stripe = stripeClient();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response(JSON.stringify({ detail: "stripe signature is required" }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, requireStripeWebhookSecret());
  } catch (error) {
    const detail = error instanceof Error ? error.message : "stripe webhook signature verification failed";
    return new Response(JSON.stringify({ detail }), {
      status: 400,
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      await fulfillStripeCheckout(stripe, ctx, session.id);
    } else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      await ctx.runMutation(internal.cloud.billing.internalMarkStripeCheckoutSessionFailed, {
        stripeCheckoutSessionId: session.id,
        error: event.type,
      });
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "failed to process stripe webhook";
    return new Response(JSON.stringify({ detail }), {
      status: 500,
      headers: new Headers({ "Content-Type": "application/json" }),
    });
  }
});

export const billRunningComputeMinute = internalMutation({
  args: {},
  returns: v.object({
    processed_runs: v.number(),
    charged_runs: v.number(),
    owed_runs: v.number(),
    skipped_runs: v.number(),
  }),
  handler: async (ctx) => {
    const nowMs = Date.now();
    const runningRuns = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", RUN_STATUS.RUNNING))
      .collect();

    let processedRuns = 0;
    let chargedRuns = 0;
    let owedRuns = 0;
    let skippedRuns = 0;

    for (const row of runningRuns) {
      if (runBillingMode(row) !== BILLING_MODE.MANAGED) {
        skippedRuns += 1;
        continue;
      }
      const startedAt = typeof row.computeStartedAt === "number" ? toUnixMillis(row.computeStartedAt) : 0;
      if (startedAt <= 0) {
        skippedRuns += 1;
        continue;
      }

      const durationMs = Math.max(0, nowMs - startedAt);
      let hourlyRateCents = 0;
      try {
        hourlyRateCents = resolveRunHourlyRateCents(row);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "run hourly rate is invalid";
        await ctx.db.patch("runs", row._id, {
          computeChargeStatus: "owed",
          computeChargeError: detail,
        });
        owedRuns += 1;
        continue;
      }

      const targetChargeCents = estimateRunUsageFromHourlyRateCents({
        hourlyRateCents,
        durationMs,
      });
      const runId = String(row._id);
      const currentCollectedCents = Math.max(0, Math.floor(row.computeCollectedCents || 0));
      const debitDeltaCents = targetChargeCents - currentCollectedCents;
      let nextCollectedCents = currentCollectedCents;
      let nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
      let nextChargeStatus: "pending" | "charged" | "owed" =
        targetChargeCents > 0 ? (nextOutstandingCents > 0 ? "owed" : "charged") : "pending";
      let nextChargeError: string | undefined = undefined;

      if (debitDeltaCents > 0) {
        const appliedDebit = await upsertLedgerDebitTotal(ctx, {
          userId: row.userId,
          targetDebitCents: targetChargeCents,
          eventType: USAGE_EVENT_TYPE.RUN_COMPUTE_SETTLEMENT_DEBIT,
          idempotencyKey: runLiveDebitIdempotencyKey(runId),
          referenceType: "run",
          referenceId: runId,
          metadata: {
            settlement: "live_tick",
            charge_cents: targetChargeCents,
            duration_ms: durationMs,
            gpu_type: row.effectiveGpuType,
            gpu_count: row.effectiveGpuCount,
            volume_gb: row.effectiveVolumeGb,
            hourly_rate_cents: hourlyRateCents,
          },
        });
        nextCollectedCents = Math.min(targetChargeCents, appliedDebit.debitedCents);
        if (nextCollectedCents > currentCollectedCents) {
          chargedRuns += 1;
        }
      }

      nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
      if (nextOutstandingCents > 0) {
        nextChargeStatus = "owed";
        nextChargeError = "outstanding compute settlement";
        owedRuns += 1;
      } else if (targetChargeCents > 0) {
        nextChargeStatus = "charged";
      } else {
        nextChargeStatus = "pending";
      }

      const previousChargeCents = Math.max(0, Math.floor(row.computeChargeCents || 0));
      const previousCollectedCents = Math.max(0, Math.floor(row.computeCollectedCents || 0));
      const previousOutstandingCents = Math.max(0, Math.floor(row.computeOutstandingCents || 0));
      const previousChargeStatus = row.computeChargeStatus || "pending";
      const previousChargeError = row.computeChargeError;
      if (
        previousChargeCents !== targetChargeCents ||
        previousCollectedCents !== nextCollectedCents ||
        previousOutstandingCents !== nextOutstandingCents ||
        previousChargeStatus !== nextChargeStatus ||
        previousChargeError !== nextChargeError
      ) {
        await ctx.db.patch("runs", row._id, {
          computeChargeCents: targetChargeCents,
          computeCollectedCents: nextCollectedCents,
          computeOutstandingCents: nextOutstandingCents,
          computeChargeStatus: nextChargeStatus,
          computeChargeError: nextChargeError,
        });
        processedRuns += 1;
      } else {
        skippedRuns += 1;
      }
    }

    return {
      processed_runs: processedRuns,
      charged_runs: chargedRuns,
      owed_runs: owedRuns,
      skipped_runs: skippedRuns,
    };
  },
});
