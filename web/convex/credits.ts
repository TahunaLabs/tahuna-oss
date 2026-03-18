import { ConvexError, v } from "convex/values";
import type { Doc } from "@convex/_generated/dataModel";
import { internalMutation, type MutationCtx } from "@convex/_generated/server";
import { BILLING_CONFIG } from "@convex/appConfig";

const BYTES_PER_GIB = 1024 * 1024 * 1024;

export const USAGE_EVENT_TYPE = {
  INITIAL_GRANT: "initial_grant",
  RUN_COMPUTE_RESERVED: "run_compute_reserved",
  RUN_COMPUTE_REFUND: "run_compute_refund",
  STORAGE_CHARGE: "storage_charge",
  STORAGE_REFUND: "storage_refund",
  MANUAL_GRANT: "manual_grant",
} as const;

type EnsureUserLedgerArgs = {
  userId: string;
  source: string;
};

type CreditEventArgs = {
  userId: string;
  amountCents: number;
  eventType: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
};

function normalizeUserId(value: string) {
  const userId = value.trim();
  if (!userId) {
    throw new ConvexError("user_id is required");
  }
  return userId;
}

function normalizeCents(value: number) {
  if (!Number.isFinite(value)) {
    throw new ConvexError("amount must be a finite number");
  }
  const cents = Math.floor(value);
  if (cents <= 0) {
    throw new ConvexError("amount must be greater than zero");
  }
  return cents;
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function safePositiveNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

async function ensureCreditsRow(
  ctx: MutationCtx,
  args: EnsureUserLedgerArgs,
  now: number,
): Promise<Doc<"userCredits">> {
  const existing = await ctx.db
    .query("userCredits")
    .withIndex("by_user", (q) => q.eq("userId", args.userId))
    .first();
  if (existing) {
    return existing;
  }

  const initialBalance = Math.max(0, Math.floor(BILLING_CONFIG.initialCreditCents));
  const creditsId = await ctx.db.insert("userCredits", {
    userId: args.userId,
    balanceCents: initialBalance,
    currency: BILLING_CONFIG.currency,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("usageEvents", {
    userId: args.userId,
    eventType: USAGE_EVENT_TYPE.INITIAL_GRANT,
    creditsDeltaCents: initialBalance,
    balanceAfterCents: initialBalance,
    referenceType: "user_credit",
    referenceId: String(creditsId),
    metadata: {
      source: args.source,
      currency: BILLING_CONFIG.currency,
    },
    createdAt: now,
  });
  const created = await ctx.db.get("userCredits", creditsId);
  if (!created) {
    throw new ConvexError("failed to initialize user credits");
  }
  return created;
}

async function requireCreditsRow(ctx: MutationCtx, args: EnsureUserLedgerArgs): Promise<Doc<"userCredits">> {
  const now = Date.now();
  return ensureCreditsRow(ctx, args, now);
}

export async function ensureUserLedger(ctx: MutationCtx, args: EnsureUserLedgerArgs) {
  const userId = normalizeUserId(args.userId);
  return requireCreditsRow(ctx, {
    userId,
    source: normalizeOptionalText(args.source) || "system",
  });
}

export async function consumeUserCredits(ctx: MutationCtx, args: CreditEventArgs) {
  const userId = normalizeUserId(args.userId);
  const amountCents = normalizeCents(args.amountCents);
  const creditsRow = await requireCreditsRow(ctx, {
    userId,
    source: "usage_event",
  });
  if (creditsRow.balanceCents < amountCents) {
    return null;
  }
  const now = Date.now();
  const balanceAfterCents = creditsRow.balanceCents - amountCents;
  await ctx.db.patch(creditsRow._id, {
    balanceCents: balanceAfterCents,
    updatedAt: now,
  });
  await ctx.db.insert("usageEvents", {
    userId,
    eventType: args.eventType,
    creditsDeltaCents: -amountCents,
    balanceAfterCents,
    referenceType: normalizeOptionalText(args.referenceType),
    referenceId: normalizeOptionalText(args.referenceId),
    metadata: args.metadata,
    createdAt: now,
  });
  return {
    balanceCents: balanceAfterCents,
  };
}

export async function grantUserCredits(ctx: MutationCtx, args: CreditEventArgs) {
  const userId = normalizeUserId(args.userId);
  const amountCents = normalizeCents(args.amountCents);
  const creditsRow = await requireCreditsRow(ctx, {
    userId,
    source: "usage_event",
  });
  const now = Date.now();
  const balanceAfterCents = creditsRow.balanceCents + amountCents;
  await ctx.db.patch(creditsRow._id, {
    balanceCents: balanceAfterCents,
    updatedAt: now,
  });
  await ctx.db.insert("usageEvents", {
    userId,
    eventType: args.eventType,
    creditsDeltaCents: amountCents,
    balanceAfterCents,
    referenceType: normalizeOptionalText(args.referenceType),
    referenceId: normalizeOptionalText(args.referenceId),
    metadata: args.metadata,
    createdAt: now,
  });
  return {
    balanceCents: balanceAfterCents,
  };
}

export function estimateRunReservationCents(args: {
  gpuCount: number | undefined;
  volumeGb: number | undefined;
}) {
  const gpuCount = safePositiveNumber(args.gpuCount);
  const volumeGb = safePositiveNumber(args.volumeGb);
  const hourlyRate =
    gpuCount * BILLING_CONFIG.computeGpuHourlyRateCents +
    volumeGb * BILLING_CONFIG.computeVolumeGbHourlyRateCents;
  const reservationCents = Math.ceil(hourlyRate * BILLING_CONFIG.computeReservationHours);
  return Math.max(BILLING_CONFIG.minimumChargeCents, reservationCents);
}

export function estimateStorageDeltaCents(sizeDeltaBytes: number | undefined) {
  if (typeof sizeDeltaBytes !== "number" || !Number.isFinite(sizeDeltaBytes) || sizeDeltaBytes === 0) {
    return 0;
  }
  const gibDelta = Math.abs(sizeDeltaBytes) / BYTES_PER_GIB;
  const cents = Math.max(
    BILLING_CONFIG.minimumChargeCents,
    Math.ceil(gibDelta * BILLING_CONFIG.storageGiBDeltaRateCents),
  );
  return sizeDeltaBytes > 0 ? cents : -cents;
}

export async function applyStorageDeltaCredits(
  ctx: MutationCtx,
  args: {
    userId: string;
    sizeDeltaBytes: number;
    referenceType: string;
    referenceId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const deltaCents = estimateStorageDeltaCents(args.sizeDeltaBytes);
  if (deltaCents === 0) {
    return 0;
  }
  if (deltaCents > 0) {
    const consumed = await consumeUserCredits(ctx, {
      userId: args.userId,
      amountCents: deltaCents,
      eventType: USAGE_EVENT_TYPE.STORAGE_CHARGE,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      metadata: args.metadata,
    });
    if (!consumed) {
      throw new ConvexError("insufficient credits");
    }
    return deltaCents;
  }
  await grantUserCredits(ctx, {
    userId: args.userId,
    amountCents: Math.abs(deltaCents),
    eventType: USAGE_EVENT_TYPE.STORAGE_REFUND,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    metadata: args.metadata,
  });
  return deltaCents;
}

export const internalEnsureUserLedger = internalMutation({
  args: {
    userId: v.string(),
    source: v.optional(v.string()),
  },
  returns: v.object({
    user_id: v.string(),
    balance_cents: v.number(),
    currency: v.string(),
  }),
  handler: async (ctx, args) => {
    const row = await ensureUserLedger(ctx, {
      userId: args.userId,
      source: args.source || "system",
    });
    return {
      user_id: row.userId,
      balance_cents: row.balanceCents,
      currency: row.currency,
    };
  },
});
