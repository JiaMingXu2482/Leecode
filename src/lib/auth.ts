import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "lrp_session";

export function createSessionToken() {
  return "passwordless";
}

export function verifyPassword() {
  return true;
}

export function isAuthorizedToken() {
  return true;
}

export async function isAuthorizedServer() {
  return true;
}

export function isAuthorizedRequest(request: NextRequest) {
  void request;
  return true;
}
