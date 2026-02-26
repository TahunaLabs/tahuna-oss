import { NextResponse } from "next/server";
import { convexServerClient } from "@/lib/convex-server";
import { authenticateRequest } from "@/lib/request-auth";
import { readJSONBody } from "../../auth/_shared";

export async function GET(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const convex = convexServerClient();
  const data = await convex.query("runs:list" as any, { userId: auth.userID as any });
  return NextResponse.json(data, { status: 200 });
}

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const body = (await readJSONBody(req)) as {
    environment_id?: string;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
  } | null;

  const environmentId = body?.environment_id?.trim() || "";
  if (!environmentId) {
    return NextResponse.json({ detail: "environment_id is required" }, { status: 400 });
  }

  try {
    const convex = convexServerClient();
    const data = await convex.mutation("runs:create" as any, {
      userId: auth.userID as any,
      environmentId: environmentId as any,
      gpu_type: body?.gpu_type?.trim() || undefined,
      gpu_count: body?.gpu_count,
      volume_gb: body?.volume_gb,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to create run";
    return NextResponse.json({ detail }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const runId = url.searchParams.get("run_id")?.trim() || "";
  if (!runId) {
    return NextResponse.json({ detail: "run_id is required" }, { status: 400 });
  }

  try {
    const convex = convexServerClient();
    const data = await convex.mutation("runs:remove" as any, {
      userId: auth.userID as any,
      runId: runId as any,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to cancel run";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
