import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { internal } from "@convex/_generated/api";
import type { ActionCtx, MutationCtx } from "@convex/_generated/server";
import { action, httpAction, internalAction, internalMutation, internalQuery, mutation, query } from "@convex/_generated/server";
import Stripe from "stripe";
import { CLOUD_BILLING_CONFIG } from "@/cloud/config";
import { resolveRunComputePricing } from "@/cloud/billing/run-compute-pricing";
import { authComponent, requireUser } from "@convex/auth";
import { RUN_CONFIG } from "@convex/appConfig";
import {
  ensureUserLedger,
  grantUserCredits,
  upsertLedgerDebitTotal,
  USAGE_EVENT_TYPE,
} from "@convex/cloud/credits";
import {
  computeLiveDebitEventType,
  computeSessionRequiredReservationCents,
  computeSessionReservationRemainingCents,
  estimateRunUsageFromHourlyRateCents,
  computeLiveDebitIdempotencyKey,
  resolveComputeSubjectHourlyRateCents,
  resolveTerminalRunTiming,
  settleComputeSessionComputeCharge,
  settleRunComputeCharge,
  toUnixMillis,
  type ComputeBillingSubject,
  type ComputeSettlementResult,
} from "@convex/cloud/runBilling";
import { COMPUTE_SESSION_STATUS } from "@convex/core/computeSessionLifecyclePlan";
export { validateHostedComputeSessionCreate } from "@convex/cloud/computeSessionReservations";

const STRIPE_CHECKOUT_PAYMENT_STATUSES = new Set(["paid", "no_payment_required"]);
export const COMPUTE_SESSION_BILLING_INTERVAL_MINUTES = 5;

const HOSTED_BILLING_CLIENT_ERROR_PATTERNS: RegExp[] = [
  /\binsufficient credits\b/i,
];

export function isHostedBillingClientError(value: string) {
  return HOSTED_BILLING_CLIENT_ERROR_PATTERNS.some((pattern) => pattern.test(value));
}

export function hostedBillingHttpStatus(value: string, fallbackStatus: number) {
  return isHostedBillingClientError(value) ? 402 : fallbackStatus;
}

function isStaleTerminatingComputeSession(row: Doc<"computeSessions">) {
  if (row.status !== COMPUTE_SESSION_STATUS.TERMINATING) {
    return false;
  }
  const since = row.terminatingSince ?? row.lastHeartbeatAt ?? row.computeStartedAt ?? row.createdAt;
  return since + RUN_CONFIG.computeSessionTerminatingTimeoutSeconds * 1000 <= Date.now();
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
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) throw new Error("SITE_URL is required");
  return siteUrl;
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

export type HostedComputeSessionBillingPatch = {
  computeEndedAt?: number;
  computeReservationRemainingCents?: number;
  computeReservationReleasedAt?: number;
  computeChargeCents: number;
  computeCollectedCents: number;
  computeOutstandingCents: number;
  computeChargeStatus: "charged" | "owed";
  computeChargeError?: string;
};

export type HostedComputeSessionUsageSettlement = {
  patch: HostedComputeSessionBillingPatch;
  eventMetadata: Record<string, number | string | undefined>;
  terminalTiming: { computeEndedAt?: number; durationMs: number };
  settlement: ComputeSettlementResult;
};

export function initialHostedComputeSessionBillingFields(hourlyRateCents: number) {
  const reservationCents = computeSessionRequiredReservationCents({ hourlyRateCents });
  return {
    computeHourlyRateCents: hourlyRateCents,
    computeReservationRequiredCents: reservationCents,
    computeReservationRemainingCents: reservationCents,
    computeChargeCents: 0,
    computeCollectedCents: 0,
    computeOutstandingCents: 0,
    computeChargeStatus: "pending" as const,
  };
}

function normalizeOptionalUnixMillis(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeReservationCents(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.floor(value));
}

function computeTerminalReservationReleasePatch(
  row: Doc<"computeSessions">,
  terminalTiming: { computeEndedAt?: number },
) {
  const requiredReservationCents = normalizeReservationCents(row.computeReservationRequiredCents) ?? 0;
  const storedRemainingCents = normalizeReservationCents(row.computeReservationRemainingCents);
  const remainingReservationCents = storedRemainingCents ?? computeSessionReservationRemainingCents({
    requiredReservationCents: row.computeReservationRequiredCents,
    collectedCents: row.computeCollectedCents,
  });
  const existingReleasedAt = normalizeOptionalUnixMillis(row.computeReservationReleasedAt);
  if (requiredReservationCents <= 0 && remainingReservationCents <= 0 && existingReleasedAt === undefined) {
    return {};
  }
  return {
    computeReservationRemainingCents: 0,
    computeReservationReleasedAt: existingReleasedAt ??
      terminalTiming.computeEndedAt ??
      Date.now(),
  };
}

export function initialHostedComputeSessionBillingFieldsForSpec(args: {
  gpuType: string;
  gpuCount: number;
  volumeGb: number;
}) {
  const pricing = resolveRunComputePricing({
    gpuType: args.gpuType,
    gpuCount: args.gpuCount,
    volumeGb: args.volumeGb,
  });
  return initialHostedComputeSessionBillingFields(pricing.hourlyRateCents);
}

export async function settleHostedComputeSessionUsage(
  ctx: MutationCtx,
  row: Doc<"computeSessions">,
): Promise<HostedComputeSessionUsageSettlement> {
  const terminalTiming = resolveTerminalRunTiming(row);
  const settlement = await settleComputeSessionComputeCharge(ctx, row, terminalTiming);
  return {
    patch: {
      computeEndedAt: terminalTiming.computeEndedAt,
      ...computeTerminalReservationReleasePatch(row, terminalTiming),
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

type LiveComputeBillingPatch = {
  computeChargeCents: number;
  computeCollectedCents: number;
  computeOutstandingCents: number;
  computeChargeStatus: "pending" | "charged" | "owed";
  computeChargeError?: string;
  computeReservationRemainingCents?: number;
};

export type LiveComputeBillingResult =
  | { kind: "patched"; patch: LiveComputeBillingPatch; charged: boolean; owed: boolean }
  | { kind: "skipped" }
  | { kind: "owed"; patch: Pick<LiveComputeBillingPatch, "computeChargeStatus" | "computeChargeError"> };

export async function billLiveComputeSubject(
  ctx: MutationCtx,
  args: {
    subject: ComputeBillingSubject;
    startedAt: number;
    previous: {
      computeChargeCents?: number;
      computeCollectedCents?: number;
      computeOutstandingCents?: number;
      computeChargeStatus?: "pending" | "charged" | "owed";
      computeChargeError?: string;
      computeReservationRequiredCents?: number;
      computeReservationRemainingCents?: number;
    };
  },
): Promise<LiveComputeBillingResult> {
  const startedAt = toUnixMillis(args.startedAt);
  if (startedAt <= 0) {
    return { kind: "skipped" };
  }

  const durationMs = Math.max(0, Date.now() - startedAt);
  let hourlyRateCents = 0;
  try {
    hourlyRateCents = resolveComputeSubjectHourlyRateCents(args.subject);
  } catch (error) {
    const detail = error instanceof Error ? error.message : `${args.subject.referenceType} hourly rate is invalid`;
    return {
      kind: "owed",
      patch: {
        computeChargeStatus: "owed",
        computeChargeError: detail,
      },
    };
  }

  const targetChargeCents = estimateRunUsageFromHourlyRateCents({
    hourlyRateCents,
    durationMs,
  });
  const currentCollectedCents = Math.max(0, Math.floor(args.previous.computeCollectedCents || 0));
  const debitDeltaCents = targetChargeCents - currentCollectedCents;
  let nextCollectedCents = currentCollectedCents;
  let nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
  let nextChargeStatus: "pending" | "charged" | "owed" =
    targetChargeCents > 0 ? (nextOutstandingCents > 0 ? "owed" : "charged") : "pending";
  let nextChargeError: string | undefined = undefined;

  if (debitDeltaCents > 0) {
    const appliedDebit = await upsertLedgerDebitTotal(ctx, {
      userId: args.subject.userId,
      targetDebitCents: targetChargeCents,
      eventType: computeLiveDebitEventType(args.subject.referenceType),
      idempotencyKey: computeLiveDebitIdempotencyKey(args.subject.referenceType, args.subject.referenceId),
      referenceType: args.subject.referenceType,
      referenceId: args.subject.referenceId,
      metadata: {
        settlement: "live_tick",
        charge_cents: targetChargeCents,
        duration_ms: durationMs,
        gpu_type: args.subject.gpuType,
        gpu_count: args.subject.gpuCount,
        volume_gb: args.subject.volumeGb,
        hourly_rate_cents: hourlyRateCents,
      },
    });
    nextCollectedCents = Math.min(targetChargeCents, appliedDebit.debitedCents);
  }

  nextOutstandingCents = Math.max(0, targetChargeCents - nextCollectedCents);
  if (nextOutstandingCents > 0) {
    nextChargeStatus = "owed";
    nextChargeError = args.subject.referenceType === "compute_session"
      ? "insufficient credits"
      : "outstanding compute settlement";
  } else if (targetChargeCents > 0) {
    nextChargeStatus = "charged";
  } else {
    nextChargeStatus = "pending";
  }

  const previousChargeCents = Math.max(0, Math.floor(args.previous.computeChargeCents || 0));
  const previousCollectedCents = Math.max(0, Math.floor(args.previous.computeCollectedCents || 0));
  const previousOutstandingCents = Math.max(0, Math.floor(args.previous.computeOutstandingCents || 0));
  const previousChargeStatus = args.previous.computeChargeStatus || "pending";
  const previousChargeError = args.previous.computeChargeError;
  const previousReservationRemainingCents = normalizeReservationCents(
    args.previous.computeReservationRemainingCents,
  );
  const hasReservation = normalizeReservationCents(args.previous.computeReservationRequiredCents) !== undefined ||
    previousReservationRemainingCents !== undefined;
  const nextReservationRemainingCents = hasReservation
    ? computeSessionReservationRemainingCents({
      requiredReservationCents: args.previous.computeReservationRequiredCents,
      collectedCents: nextCollectedCents,
    })
    : undefined;
  if (
    previousChargeCents === targetChargeCents &&
    previousCollectedCents === nextCollectedCents &&
    previousOutstandingCents === nextOutstandingCents &&
    previousChargeStatus === nextChargeStatus &&
    previousChargeError === nextChargeError &&
    (!hasReservation || previousReservationRemainingCents === nextReservationRemainingCents)
  ) {
    return { kind: "skipped" };
  }

  return {
    kind: "patched",
    charged: nextCollectedCents > currentCollectedCents,
    owed: nextOutstandingCents > 0,
    patch: {
      computeChargeCents: targetChargeCents,
      computeCollectedCents: nextCollectedCents,
      computeOutstandingCents: nextOutstandingCents,
      computeChargeStatus: nextChargeStatus,
      computeChargeError: nextChargeError,
      ...(hasReservation ? { computeReservationRemainingCents: nextReservationRemainingCents } : {}),
    },
  };
}

export async function applyComputeSessionLiveBillingResult(
  ctx: MutationCtx,
  row: Doc<"computeSessions">,
  result: LiveComputeBillingResult,
) {
  if (result.kind === "skipped") {
    return {
      processed: false,
      charged: false,
      owed: false,
      skipped: true,
    };
  }
  if (result.kind === "owed") {
    await ctx.db.patch("computeSessions", row._id, {
      computeChargeStatus: result.patch.computeChargeStatus,
      computeChargeError: result.patch.computeChargeError,
    });
    return {
      processed: false,
      charged: false,
      owed: true,
      skipped: false,
    };
  }

  await ctx.db.patch("computeSessions", row._id, result.patch);
  if (
    result.owed &&
    (
      row.status !== COMPUTE_SESSION_STATUS.TERMINATING ||
      isStaleTerminatingComputeSession(row)
    )
  ) {
    // The termination-timeout cron owns normal recovery; billing only re-drives stale terminations.
    await ctx.scheduler.runAfter(0, internal.computeSessions.internalTerminateInsufficientCreditsSession, {
      userId: row.userId,
      environmentId: row.environmentId,
      computeSessionId: row._id,
      ...(row.activeRunId ? { activeRunId: row.activeRunId } : {}),
      ...(row.serveId ? { serveId: row.serveId } : {}),
    });
  }
  return {
    processed: true,
    charged: result.charged,
    owed: result.owed,
    skipped: false,
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
        initialized: true,
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
      updated_at: v.number(),
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
      .withIndex("by_user_and_updated_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      event_type: row.eventType,
      credits_delta_cents: row.creditsDeltaCents,
      balance_after_cents: row.balanceAfterCents,
      reference_type: row.referenceType ?? null,
      reference_id: row.referenceId ?? null,
      metadata: row.metadata ?? null,
      updated_at: row.updatedAt,
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
      .withIndex("by_user_and_status", (q) => q.eq("userId", userId).eq("status", "fulfilled"))
      .order("desc")
      .take(limit);
    return rows.map((row) => ({
      amount_cents: row.amountCents,
      credits_cents: row.creditsCents,
      currency: row.currency,
      stripe_checkout_session_id: row.stripeCheckoutSessionId ?? null,
      stripe_payment_intent_id: row.stripePaymentIntentId ?? null,
      created_at: row._creationTime,
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
    event = await stripe.webhooks.constructEventAsync(body, signature, requireStripeWebhookSecret());
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

export const BILLABLE_COMPUTE_SESSION_STATUSES = [
  COMPUTE_SESSION_STATUS.PROVISIONING,
  COMPUTE_SESSION_STATUS.IDLE,
  COMPUTE_SESSION_STATUS.RUNNING,
  COMPUTE_SESSION_STATUS.TERMINATING,
] as const;
const BILLABLE_COMPUTE_SESSION_STATUS_SET = new Set<string>(BILLABLE_COMPUTE_SESSION_STATUSES);
const COMPUTE_SESSION_BILLING_BATCH_SIZE = 25;

const computeSessionBillingCountersValidator = v.object({
  processed_compute_sessions: v.number(),
  charged_compute_sessions: v.number(),
  owed_compute_sessions: v.number(),
  skipped_compute_sessions: v.number(),
});
type ComputeSessionBillingIdsPage = {
  compute_session_ids: Id<"computeSessions">[];
  next_cursor: string | null;
};

function emptyComputeSessionBillingCounters() {
  return {
    processed_compute_sessions: 0,
    charged_compute_sessions: 0,
    owed_compute_sessions: 0,
    skipped_compute_sessions: 0,
  };
}

function addComputeSessionBillingCounters(
  total: ReturnType<typeof emptyComputeSessionBillingCounters>,
  next: ReturnType<typeof emptyComputeSessionBillingCounters>,
) {
  total.processed_compute_sessions += next.processed_compute_sessions;
  total.charged_compute_sessions += next.charged_compute_sessions;
  total.owed_compute_sessions += next.owed_compute_sessions;
  total.skipped_compute_sessions += next.skipped_compute_sessions;
}

export const internalListBillableComputeSessionIdsPage = internalQuery({
  args: {
    status: v.string(),
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    compute_session_ids: v.array(v.id("computeSessions")),
    next_cursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.max(1, Math.min(100, Math.floor(args.batchSize ?? COMPUTE_SESSION_BILLING_BATCH_SIZE)));
    const result = await ctx.db
      .query("computeSessions")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .paginate({ cursor: args.cursor, numItems: batchSize });
    return {
      compute_session_ids: result.page.map((row) => row._id),
      next_cursor: result.isDone ? null : result.continueCursor,
    };
  },
});

export const internalBillComputeSessionBatch = internalMutation({
  args: { computeSessionIds: v.array(v.id("computeSessions")) },
  returns: computeSessionBillingCountersValidator,
  handler: async (ctx, args) => {
    const counters = emptyComputeSessionBillingCounters();
    for (const computeSessionId of args.computeSessionIds) {
      const row = await ctx.db.get("computeSessions", computeSessionId);
      if (!row || !BILLABLE_COMPUTE_SESSION_STATUS_SET.has(row.status)) {
        continue;
      }
      const result = await billLiveComputeSubject(ctx, {
        subject: {
          userId: row.userId,
          referenceType: "compute_session",
          referenceId: String(row._id),
          gpuType: row.effectiveGpuType,
          gpuCount: row.effectiveGpuCount,
          volumeGb: row.effectiveVolumeGb,
          computeHourlyRateCents: row.computeHourlyRateCents,
          computeCollectedCents: row.computeCollectedCents,
        },
        startedAt: row.computeStartedAt ?? row.providerCreationTime ?? 0,
        previous: {
          computeChargeCents: row.computeChargeCents,
          computeCollectedCents: row.computeCollectedCents,
          computeOutstandingCents: row.computeOutstandingCents,
          computeChargeStatus: row.computeChargeStatus,
          computeChargeError: row.computeChargeError,
          computeReservationRequiredCents: row.computeReservationRequiredCents,
          computeReservationRemainingCents: row.computeReservationRemainingCents,
        },
      });
      const applied = await applyComputeSessionLiveBillingResult(ctx, row, result);
      if (applied.skipped) {
        counters.skipped_compute_sessions += 1;
        continue;
      }
      if (applied.processed) {
        counters.processed_compute_sessions += 1;
      }
      if (applied.charged) {
        counters.charged_compute_sessions += 1;
      }
      if (applied.owed) {
        counters.owed_compute_sessions += 1;
      }
    }
    return counters;
  },
});

export const billComputeSessionsFiveMinutes = internalAction({
  args: {},
  returns: computeSessionBillingCountersValidator,
  handler: async (ctx) => {
    const counters = emptyComputeSessionBillingCounters();
    for (const status of BILLABLE_COMPUTE_SESSION_STATUSES) {
      let cursor: string | null = null;
      do {
        const page: ComputeSessionBillingIdsPage = await ctx.runQuery(
          internal.cloud.billing.internalListBillableComputeSessionIdsPage,
          {
            status,
            cursor,
            batchSize: COMPUTE_SESSION_BILLING_BATCH_SIZE,
          },
        );
        if (page.compute_session_ids.length > 0) {
          addComputeSessionBillingCounters(
            counters,
            await ctx.runMutation(internal.cloud.billing.internalBillComputeSessionBatch, {
              computeSessionIds: page.compute_session_ids,
            }),
          );
        }
        cursor = page.next_cursor;
      } while (cursor !== null);
    }
    return counters;
  },
});
