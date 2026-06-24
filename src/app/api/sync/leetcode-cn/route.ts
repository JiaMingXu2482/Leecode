import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { LeetCodeSyncInputError, runLeetCodeCnSync } from "@/lib/leetcode-sync-service";

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    cookie?: string;
    syncCode?: boolean;
  };

  try {
    const result = await runLeetCodeCnSync({
      cookieOverride: body.cookie,
      persistCookie: true,
      syncCode: body.syncCode ?? true,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    const status = error instanceof LeetCodeSyncInputError ? error.status : 502;

    return NextResponse.json({ error: message }, { status });
  }
}
