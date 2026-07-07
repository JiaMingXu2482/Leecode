import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { regenerateWeek } from "@/lib/plan-actions";

// 重排本周: full re-plan of the current week (today → Sunday). Each day gets
// its due reviews plus the per-day new-problem quota (priority categories
// first); completed items are preserved. Logic lives in lib/plan-actions so
// the plan assistant can reuse it.
export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const weekPlans = await regenerateWeek();
  return NextResponse.json({ weekPlans });
}
