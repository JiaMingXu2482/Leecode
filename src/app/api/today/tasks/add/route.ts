import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { orderDailyNewPicks } from "@/lib/new-problem-picker";
import { getPlanSettings } from "@/lib/settings";
import { NEW_POOL_WHERE } from "@/lib/week-plans";

// 添加一题: append the next NEW problem to today's plan — priority categories
// first, then Hot100 order. Reviews are scheduled by due date, never here.
export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const settings = await getPlanSettings();
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

  const pool = await db.problem.findMany({
    where: NEW_POOL_WHERE,
    orderBy: { hot100Order: "asc" },
  });
  const [next] = orderDailyNewPicks(
    pool.filter((problem) => !plannedIds.has(problem.id)),
    settings.priorityCategories,
    1,
  );

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
