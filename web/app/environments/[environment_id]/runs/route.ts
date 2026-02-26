import { NextResponse } from "next/server";
import { convexServerClient } from "@/lib/convex-server";
import { authenticateRequest } from "@/lib/request-auth";
import { readJSONBody } from "@/app/api/auth/_shared";

export async function POST(req: Request, { params }: { params: Promise<{ environment_id: string }> }) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const { environment_id } = await params;
  const body = (await readJSONBody(req)) as { gpu_type?: string; gpu_count?: number; volume_gb?: number } | null;

  try {
    const convex = convexServerClient();
    const out = await convex.mutation("runs:create" as any, {
      userId: auth.userID as any,
      environmentId: environment_id as any,
      gpu_type: body?.gpu_type?.trim() || undefined,
      gpu_count: body?.gpu_count,
      volume_gb: body?.volume_gb,
    });
    return NextResponse.json(out, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to create run";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
