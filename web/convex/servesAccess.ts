import { ConvexError } from "convex/values"
import type { Id } from "@convex/_generated/dataModel"
import type { MutationCtx, QueryCtx } from "@convex/_generated/server"

export async function getAccessibleServe(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  serveId: Id<"serves">,
  _requiredPermission?: "read" | "edit",
) {
  const row = await ctx.db.get("serves", serveId)
  if (!row) {
    throw new ConvexError("serve not found")
  }
  if (row.userId !== userId) {
    throw new ConvexError("serve not found")
  }
  return row
}

export async function listServesForUser(ctx: QueryCtx | MutationCtx, userId: string) {
  return ctx.db
    .query("serves")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()
}
