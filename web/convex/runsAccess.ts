import { ConvexError } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "@convex/_generated/server";

export async function getAccessibleRun(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  runId: Id<"runs">,
  _requiredPermission?: "read" | "edit",
) {
  const row = await ctx.db.get("runs", runId);
  if (!row) {
    throw new ConvexError("run not found");
  }
  if (row.userId !== userId) {
    throw new ConvexError("run not found");
  }
  return row;
}

export async function getAccessibleEnvironment(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  environmentId: Id<"environments">,
  _requiredPermission?: "read" | "edit",
) {
  const env = await ctx.db.get("environments", environmentId);
  if (!env) {
    throw new ConvexError("environment not found");
  }
  if (env.userId !== userId) {
    throw new ConvexError("environment not found");
  }
  if (typeof env.deletionScheduledAt === "number") {
    throw new ConvexError("environment not found");
  }
  return env;
}

export async function listRunsForUser(ctx: QueryCtx | MutationCtx, userId: string) {
  return ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
}
