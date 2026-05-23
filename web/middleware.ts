import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexSiteUrl) return;

  const { pathname, search } = request.nextUrl;
  return NextResponse.rewrite(new URL(pathname + search, convexSiteUrl));
}

export const config = {
  matcher: "/api/((?!auth/).+)",
};
