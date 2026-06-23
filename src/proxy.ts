import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedToken, SESSION_COOKIE } from "@/lib/auth";

const protectedPrefixes = ["/today", "/weekly", "/problems", "/reviews", "/stats", "/settings"];

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  if (isAuthorizedToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/today/:path*", "/weekly/:path*", "/problems/:path*", "/reviews/:path*", "/stats/:path*", "/settings/:path*"],
};
