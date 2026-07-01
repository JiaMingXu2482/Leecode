import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { fromDateKey, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadWeekPlans } from "@/lib/week-plans";

// Add one specific problem to a specific day (drag a search result onto a day).
export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { date?: string; problemId?: string };
  if (!body.date || Number.isNaN(fromDateKey(body.date).getTime())) {
    return NextResponse.json({ error: "日期无效" }, { status: 400 });
  }
  if (!body.problemId) {
    return NextResponse.json({ error: "缺少题目" }, { status: 400 });
  }
  const date = fromDateKey(body.date);
  if (weekdayIndex(date) === 0) {
    return NextResponse.json({ error: "周日休息，不排题" }, { status: 400 });
  }

  const db = getDb();
  const problem = await db.problem.findUnique({
    where: { id: body.problemId },
    include: { reviewSchedule: true },
  });
  if (!problem) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  const plan = await db.dailyPlan.upsert({
    where: { date },
    update: {},
    create: { date, availableMinutes: 0, totalEstimatedMinutes: 0 },
  });

  // Already on that day → no-op.
  const existing = await db.planItem.findFirst({
    where: { dailyPlanId: plan.id, problemId: problem.id },
  });
  if (existing) {
    return NextResponse.json({ weekPlans: await loadWeekPlans(startOfUtcDay(new Date())) });
  }

  const kind = problem.reviewSchedule
    ? problem.reviewSchedule.stage === 0
      ? PlanItemKind.RETEST
      : PlanItemKind.REVIEW
    : PlanItemKind.NEW;
  const estimatedMinutes =
    kind === PlanItemKind.NEW ? problem.estimatedNewMinutes : problem.estimatedReviewMinutes;
  const maxSort = await db.planItem.aggregate({
    where: { dailyPlanId: plan.id },
    _max: { sortOrder: true },
  });

  await db.$transaction([
    db.planItem.create({
      data: {
        dailyPlanId: plan.id,
        problemId: problem.id,
        kind,
        estimatedMinutes,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    }),
    db.dailyPlan.update({
      where: { id: plan.id },
      data: {
        totalEstimatedMinutes: { increment: estimatedMinutes },
        availableMinutes: { increment: estimatedMinutes },
      },
    }),
  ]);

  return NextResponse.json({ weekPlans: await loadWeekPlans(startOfUtcDay(new Date())) });
}
