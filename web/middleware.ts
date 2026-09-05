import { NextResponse, type NextRequest } from "next/server";

const convexSiteUrl = process.env.CONVEX_INTERNAL_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
if (!convexSiteUrl) throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is required");

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  return NextResponse.rewrite(new URL(pathname + search, convexSiteUrl));
}

export const config = {
  matcher: "/api/((?!auth/).+)",
};
