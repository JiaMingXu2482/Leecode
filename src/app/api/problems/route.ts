import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { deletePlanItemsRestoringMinutes, topUpNewProblems } from "@/lib/week-plans";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const problems = await getDb().problem.findMany({
    orderBy: { hot100Order: "asc" },
    include: {
      progress: true,
      reviewSchedule: true,
    },
  });

  return NextResponse.json({ problems });
}

// Bulk include/exclude problems from the practice list (e.g. a whole topic).
export async function PATCH(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    problemIds?: string[];
    isEnabled?: boolean;
  };

  if (!Array.isArray(body.problemIds) || typeof body.isEnabled !== "boolean") {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const db = getDb();
  await db.problem.updateMany({
    where: { id: { in: body.problemIds } },
    data: { isEnabled: body.isEnabled },
  });

  // Excluding a problem drops its review schedule and removes it from today's
  // and upcoming daily plans so it disappears from the plan right away (done
  // items stay — completed work is never erased). This week's days are then
  // topped back up to the per-day new-problem quota.
  if (body.isEnabled === false) {
    const today = startOfUtcDay(new Date());
    await db.reviewSchedule.deleteMany({ where: { problemId: { in: body.problemIds } } });
    await deletePlanItemsRestoringMinutes({
      problemId: { in: body.problemIds },
      isCompleted: false,
      dailyPlan: { date: { gte: today } },
    });
    await topUpNewProblems(today);
  }

  return NextResponse.json({ ok: true, count: body.problemIds.length });
}
