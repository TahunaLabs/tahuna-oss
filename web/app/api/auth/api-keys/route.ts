import { NextResponse } from "next/server";
import { convexServerClient } from "@/lib/convex-server";
import { getSessionEmail } from "@/lib/better-auth-session";
import { readJSONBody } from "../_shared";

export async function POST(req: Request) {
  const email = await getSessionEmail(req);
  if (!email) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const body = (await readJSONBody(req)) as { name?: string } | null;
  const name = body?.name?.trim() || "cli";

  try {
    const convex = convexServerClient();
    const me = await convex.mutation("auth:upsertUserByEmail" as any, { email });
    const out = await convex.mutation("auth:createApiKey" as any, {
      userId: (me as { user_id: string }).user_id as any,
      name,
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "could not create API key";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
