import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = getDb();
  const state = await db.leetCodeSyncState.upsert({
    where: { id: "leetcode-cn" },
    update: {},
    create: { id: "leetcode-cn" },
  });

  return NextResponse.json({
    ...state,
    cookie: state.cookie ? "已保存" : "",
    hasCookie: Boolean(state.cookie),
  });
}
