import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

export const SESSION_COOKIE = "lrp_session";

function getPassword() {
  return process.env.APP_PASSWORD || "change-me-before-deploy";
}

function getSecret() {
  return process.env.SESSION_SECRET || "dev-session-secret";
}

export function createSessionToken() {
  return crypto
    .createHash("sha256")
    .update(`${getPassword()}:${getSecret()}`)
    .digest("hex");
}

export function verifyPassword(password: string) {
  return crypto.timingSafeEqual(
    Buffer.from(crypto.createHash("sha256").update(password).digest("hex")),
    Buffer.from(crypto.createHash("sha256").update(getPassword()).digest("hex")),
  );
}

export function isAuthorizedToken(token?: string | null) {
  if (!token) {
    return false;
  }

  const expected = createSessionToken();

  if (token.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function isAuthorizedServer() {
  const cookieStore = await cookies();
  return isAuthorizedToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export function isAuthorizedRequest(request: NextRequest) {
  return isAuthorizedToken(request.cookies.get(SESSION_COOKIE)?.value);
}
