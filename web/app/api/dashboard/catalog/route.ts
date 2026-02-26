import { NextResponse } from "next/server";
import { convexServerClient } from "@/lib/convex-server";

export async function GET() {
  try {
    const convex = convexServerClient();
    const data = await convex.query("catalog:getCatalog" as any, {});
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "failed to load catalog";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
