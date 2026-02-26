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
  const data = await convex.query("environments:list" as any, { userId: auth.userID as any });
  return NextResponse.json(data, { status: 200 });
}

export async function POST(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const body = (await readJSONBody(req)) as {
    name?: string;
    gpu_type?: string;
    gpu_count?: number;
    volume_gb?: number;
    framework?: string;
    version?: string;
  } | null;

  try {
    const convex = convexServerClient();
    const data = await convex.mutation("environments:create" as any, {
      userId: auth.userID as any,
      name: body?.name?.trim() || "",
      gpu_type: body?.gpu_type?.trim() || "",
      gpu_count: body?.gpu_count ?? 0,
      volume_gb: body?.volume_gb ?? 0,
      framework: body?.framework?.trim() || "",
      version: body?.version?.trim() || "",
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to create environment";
    return NextResponse.json({ detail }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return NextResponse.json({ detail: "authentication required" }, { status: 401 });
  }

  const url = new URL(req.url);
  const environmentId = url.searchParams.get("env_id")?.trim() || "";
  if (!environmentId) {
    return NextResponse.json({ detail: "env_id is required" }, { status: 400 });
  }

  try {
    const convex = convexServerClient();
    const data = await convex.mutation("environments:remove" as any, {
      userId: auth.userID as any,
      environmentId: environmentId as any,
    });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to delete environment";
    return NextResponse.json({ detail }, { status: 400 });
  }
}
