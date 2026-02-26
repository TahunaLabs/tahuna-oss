import { convexServerClient } from "@/lib/convex-server";
/**
 * CLI REST endpoint — used by the Tahuna CLI (API-key auth).
 * The dashboard uses Convex directly via React hooks instead.
 */
import { NextResponse } from "next/server";

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
