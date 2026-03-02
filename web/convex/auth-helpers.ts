import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";
import { authComponent } from "./auth-component";

type AuthUser = Awaited<ReturnType<typeof authComponent.getAuthUser>>;
type RequiredAuthUser = NonNullable<AuthUser>;

export async function requireUser(ctx: GenericCtx<DataModel>): Promise<RequiredAuthUser> {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}
