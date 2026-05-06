import { ConvexError, v } from "convex/values";
import type { Doc } from "@convex/_generated/dataModel";
import { internalMutation, type MutationCtx } from "@convex/_generated/server";
import { CLOUD_BILLING_CONFIG } from "@/cloud/config";

const BYTES_PER_GIB = 1024 * 1024 * 1024;

export const USAGE_EVENT_TYPE = {
  INITIAL_GRANT: "initial_grant",
  RUN_COMPUTE_RESERVED: "run_compute_reserved",
  RUN_COMPUTE_SETTLEMENT_DEBIT: "run_compute_settlement_debit",
  RUN_COMPUTE_SETTLEMENT_REFUND: "run_compute_settlement_refund",
  RUN_COMPUTE_SETTLEMENT_OWED: "run_compute_settlement_owed",
  STORAGE_CHARGE: "storage_charge",
} as const;

type EnsureUserLedgerArgs = {
  userId: string;
  source: string;
};

type CreditEventArgs = {
  userId: string;
  amountCents: number;
  eventType: string;
  idempotencyKey?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
};

type LedgerEntryArgs = {
  userId: string;
  deltaCents: number;
  eventType: string;
  idempotencyKey?: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Record<string, unknown>;
};

type LedgerEntryResult = {
  balanceCents: number;
  applied: boolean;
  deltaCents: number;
};

type UpsertLedgerDebitTotalResult = {
  balanceCents: number;
  debitedCents: number;
  appliedCents: number;
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

function normalizeLedgerDelta(value: number) {
  if (!Number.isFinite(value)) {
    throw new ConvexError("amount must be a finite number");
  }
  return Math.trunc(value);
}

function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

  const initialBalance = Math.max(0, Math.floor(CLOUD_BILLING_CONFIG.initialCreditCents));
  const creditsId = await ctx.db.insert("userCredits", {
    userId: args.userId,
    balanceCents: initialBalance,
    currency: CLOUD_BILLING_CONFIG.currency,
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
      currency: CLOUD_BILLING_CONFIG.currency,
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

async function findUsageEventByIdempotencyKey(
  ctx: MutationCtx,
  userId: string,
  idempotencyKey: string | undefined,
) {
  const normalizedIdempotencyKey = normalizeOptionalText(idempotencyKey);
  if (!normalizedIdempotencyKey) {
    return null;
  }
  return ctx.db
    .query("usageEvents")
    .withIndex("by_user_and_idempotency_key", (q) => q.eq("userId", userId).eq("idempotencyKey", normalizedIdempotencyKey))
    .first();
}

export async function postLedgerEntry(ctx: MutationCtx, args: LedgerEntryArgs): Promise<LedgerEntryResult | null> {
  const userId = normalizeUserId(args.userId);
  const deltaCents = normalizeLedgerDelta(args.deltaCents);
  const idempotencyKey = normalizeOptionalText(args.idempotencyKey);
  const existing = await findUsageEventByIdempotencyKey(ctx, userId, idempotencyKey);
  if (existing) {
    return {
      balanceCents: existing.balanceAfterCents,
      applied: false,
      deltaCents: existing.creditsDeltaCents,
    };
  }

  const creditsRow = await requireCreditsRow(ctx, {
    userId,
    source: "usage_event",
  });
  if (deltaCents < 0 && creditsRow.balanceCents < Math.abs(deltaCents)) {
    return null;
  }

  const now = Date.now();
  const balanceAfterCents = creditsRow.balanceCents + deltaCents;
  if (deltaCents !== 0) {
    await ctx.db.patch(creditsRow._id, {
      balanceCents: balanceAfterCents,
      updatedAt: now,
    });
  }
  await ctx.db.insert("usageEvents", {
    userId,
    eventType: args.eventType,
    creditsDeltaCents: deltaCents,
    balanceAfterCents,
    idempotencyKey,
    referenceType: normalizeOptionalText(args.referenceType),
    referenceId: normalizeOptionalText(args.referenceId),
    metadata: args.metadata,
    createdAt: now,
  });
  return {
    balanceCents: balanceAfterCents,
    applied: true,
    deltaCents,
  };
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
  return postLedgerEntry(ctx, {
    userId,
    deltaCents: -amountCents,
    eventType: args.eventType,
    idempotencyKey: args.idempotencyKey,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    metadata: args.metadata,
  });
}

export async function grantUserCredits(ctx: MutationCtx, args: CreditEventArgs) {
  const userId = normalizeUserId(args.userId);
  const amountCents = normalizeCents(args.amountCents);
  return postLedgerEntry(ctx, {
    userId,
    deltaCents: amountCents,
    eventType: args.eventType,
    idempotencyKey: args.idempotencyKey,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    metadata: args.metadata,
  });
}

export async function recordLedgerEvent(
  ctx: MutationCtx,
  args: Omit<LedgerEntryArgs, "deltaCents"> & { deltaCents?: number },
) {
  return postLedgerEntry(ctx, {
    ...args,
    deltaCents: args.deltaCents ?? 0,
  });
}

export async function upsertLedgerDebitTotal(
  ctx: MutationCtx,
  args: {
    userId: string;
    targetDebitCents: number;
    eventType: string;
    idempotencyKey: string;
    referenceType?: string;
    referenceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<UpsertLedgerDebitTotalResult> {
  const userId = normalizeUserId(args.userId);
  const targetDebitCents = Math.max(0, Math.floor(args.targetDebitCents));
  const idempotencyKey = normalizeOptionalText(args.idempotencyKey);
  if (!idempotencyKey) {
    throw new ConvexError("idempotency_key is required");
  }

  const creditsRow = await requireCreditsRow(ctx, {
    userId,
    source: "usage_event",
  });
  const existing = await findUsageEventByIdempotencyKey(ctx, userId, idempotencyKey);
  const existingDebitedCents = existing ? Math.max(0, -Math.floor(existing.creditsDeltaCents)) : 0;
  const debitDeltaCents = Math.max(0, targetDebitCents - existingDebitedCents);
  const appliedCents = Math.min(debitDeltaCents, creditsRow.balanceCents);
  const nextDebitedCents = existingDebitedCents + appliedCents;
  const now = Date.now();
  const balanceAfterCents = creditsRow.balanceCents - appliedCents;

  if (appliedCents > 0) {
    await ctx.db.patch(creditsRow._id, {
      balanceCents: balanceAfterCents,
      updatedAt: now,
    });
  }

  const nextDeltaCents = -nextDebitedCents;
  if (existing) {
    if (
      existing.creditsDeltaCents !== nextDeltaCents ||
      existing.balanceAfterCents !== balanceAfterCents ||
      existing.referenceType !== normalizeOptionalText(args.referenceType) ||
      existing.referenceId !== normalizeOptionalText(args.referenceId) ||
      existing.eventType !== args.eventType
    ) {
      await ctx.db.patch(existing._id, {
        eventType: args.eventType,
        creditsDeltaCents: nextDeltaCents,
        balanceAfterCents: balanceAfterCents,
        referenceType: normalizeOptionalText(args.referenceType),
        referenceId: normalizeOptionalText(args.referenceId),
        metadata: args.metadata,
        createdAt: now,
      });
    }
  } else {
    await ctx.db.insert("usageEvents", {
      userId,
      eventType: args.eventType,
      creditsDeltaCents: nextDeltaCents,
      balanceAfterCents: balanceAfterCents,
      idempotencyKey,
      referenceType: normalizeOptionalText(args.referenceType),
      referenceId: normalizeOptionalText(args.referenceId),
      metadata: args.metadata,
      createdAt: now,
    });
  }

  return {
    balanceCents: balanceAfterCents,
    debitedCents: nextDebitedCents,
    appliedCents,
  };
}

export function estimateStorageDeltaCents(sizeDeltaBytes: number | undefined) {
  if (typeof sizeDeltaBytes !== "number" || !Number.isFinite(sizeDeltaBytes) || sizeDeltaBytes === 0) {
    return 0;
  }
  const gibDelta = Math.abs(sizeDeltaBytes) / BYTES_PER_GIB;
  const cents = Math.max(
    CLOUD_BILLING_CONFIG.minimumChargeCents,
    Math.ceil(gibDelta * CLOUD_BILLING_CONFIG.storageGiBDeltaRateCents),
  );
  return sizeDeltaBytes > 0 ? cents : -cents;
}

export async function applyStorageDeltaCredits(
  ctx: MutationCtx,
  args: {
    userId: string;
    sizeDeltaBytes: number;
    idempotencyKey?: string;
    referenceType: string;
    referenceId: string;
    metadata?: Record<string, unknown>;
  },
) {
  const deltaCents = estimateStorageDeltaCents(args.sizeDeltaBytes);
  if (deltaCents <= 0) {
    return 0;
  }
  const consumed = await consumeUserCredits(ctx, {
    userId: args.userId,
    amountCents: deltaCents,
    eventType: USAGE_EVENT_TYPE.STORAGE_CHARGE,
    idempotencyKey: args.idempotencyKey,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    metadata: args.metadata,
  });
  if (!consumed) {
    throw new ConvexError("insufficient credits");
  }
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
