/**
 * CLI REST endpoint — used by the Tahuna CLI (API-key auth).
 * The dashboard uses Convex directly via React hooks instead.
 */
import { convexServerClient } from "@/lib/convex-server";
import { authenticateRequest } from "@/lib/request-auth";
import { NextResponse } from "next/server";

export async function GET(req: Request, { params }: { params: Promise<{ environment_id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const { environment_id } = await params;
  try {
    const convex = convexServerClient();
    const env = await convex.query("environments:get" as any, {
      userId: auth.userID as any,
      environmentId: environment_id as any,
    });
    return NextResponse.json(env, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load environment";
    return NextResponse.json({ detail }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ environment_id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const { environment_id } = await params;
  try {
    const convex = convexServerClient();
    const out = await convex.mutation("environments:remove" as any, {
      userId: auth.userID as any,
      environmentId: environment_id as any,
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to delete environment";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
