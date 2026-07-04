import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";

// 添加一题: append the next NEW problem (Hot100 order) to today's plan. Reviews
// are scheduled by due date — this button is only for doing extra new problems.
export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const dailyPlan = await db.dailyPlan.upsert({
    where: { date: today },
    update: {},
    create: { date: today, availableMinutes: 0, totalEstimatedMinutes: 0 },
  });
  const existing = await db.planItem.findMany({
    where: { dailyPlanId: dailyPlan.id },
    select: { sortOrder: true, estimatedMinutes: true },
  });

  // Skip anything already scheduled this week so days don't share a problem.
  const plannedThisWeek = await db.planItem.findMany({
    where: { dailyPlan: { date: { gte: weekStart, lt: addUtcDays(weekStart, 7) } } },
    select: { problemId: true },
  });
  const plannedIds = new Set(plannedThisWeek.map((item) => item.problemId));

  const newProblems = await db.problem.findMany({
    where: {
      isEnabled: true,
      reviewSchedule: null,
      OR: [{ progress: null }, { progress: { is: { isAccepted: false } } }],
    },
    orderBy: { hot100Order: "asc" },
    take: 200,
  });
  const next = newProblems.find((problem) => !plannedIds.has(problem.id));

  if (!next) {
    return NextResponse.json({ error: "没有可以再添加的新题了" }, { status: 409 });
  }

  const sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
  const usedMinutes = existing.reduce((sum, item) => sum + item.estimatedMinutes, 0);

  const item = await db.$transaction(async (tx) => {
    const created = await tx.planItem.create({
      data: {
        dailyPlanId: dailyPlan.id,
        problemId: next.id,
        kind: "NEW",
        estimatedMinutes: next.estimatedNewMinutes,
        sortOrder,
      },
    });
    await tx.dailyPlan.update({
      where: { id: dailyPlan.id },
      data: { totalEstimatedMinutes: usedMinutes + next.estimatedNewMinutes },
    });
    return created;
  });

  return NextResponse.json({ item });
}
