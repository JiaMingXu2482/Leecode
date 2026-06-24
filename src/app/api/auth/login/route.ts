import { NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { password?: string };

  if (!body.password || !verifyPassword(body.password)) {
    return NextResponse.json({ error: "访问密码不正确" }, { status: 401 });
  }

  // Only mark the cookie Secure when the request actually arrived over HTTPS,
  // otherwise a plain http://host:3000 deployment can't resend the cookie and
  // login loops back to /login.
  const isHttps =
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:";

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
