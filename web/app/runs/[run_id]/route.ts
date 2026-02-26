import { NextResponse } from "next/server";
import { convexServerClient } from "@/lib/convex-server";
import { authenticateRequest } from "@/lib/request-auth";

export async function GET(req: Request, { params }: { params: Promise<{ run_id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const { run_id } = await params;
  try {
    const convex = convexServerClient();
    const run = await convex.query("runs:get" as any, { userId: auth.userID as any, runId: run_id as any });
    return NextResponse.json(run, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load run";
    return NextResponse.json({ detail }, { status: 404 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ run_id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const { run_id } = await params;
  try {
    const convex = convexServerClient();
    const out = await convex.mutation("runs:remove" as any, { userId: auth.userID as any, runId: run_id as any });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to delete run";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
