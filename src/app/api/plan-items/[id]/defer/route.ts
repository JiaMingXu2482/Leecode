import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { loadWeekPlans } from "@/lib/week-plans";

// Push a single plan item to the next day (skipping Sunday, the rest day)
// without reshuffling the rest of the week. "今天不做这题，往后排一天。"
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const item = await db.planItem.findUnique({
    where: { id },
    include: { dailyPlan: true },
  });

  if (!item) {
    return NextResponse.json({ error: "计划项不存在" }, { status: 404 });
  }

  // Next day, skipping Sunday (weekday 0).
  let target = addUtcDays(startOfUtcDay(item.dailyPlan.date), 1);
  if (weekdayIndex(target) === 0) {
    target = addUtcDays(target, 1);
  }

  const targetPlan = await db.dailyPlan.upsert({
    where: { date: target },
    update: {},
    create: { date: target, availableMinutes: 0, totalEstimatedMinutes: 0 },
  });

  // If the problem is already scheduled on the target day, just drop this item
  // instead of creating a duplicate.
  const duplicate = await db.planItem.findFirst({
    where: { dailyPlanId: targetPlan.id, problemId: item.problemId },
  });
  const maxSort = await db.planItem.aggregate({
    where: { dailyPlanId: targetPlan.id },
    _max: { sortOrder: true },
  });

  await db.$transaction([
    duplicate
      ? db.planItem.delete({ where: { id: item.id } })
      : db.planItem.update({
          where: { id: item.id },
          data: {
            dailyPlanId: targetPlan.id,
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
            isCompleted: false,
          },
        }),
    db.dailyPlan.update({
      where: { id: item.dailyPlanId },
      data: {
        totalEstimatedMinutes: { decrement: item.estimatedMinutes },
        availableMinutes: { decrement: item.estimatedMinutes },
      },
    }),
    ...(duplicate
      ? []
      : [
          db.dailyPlan.update({
            where: { id: targetPlan.id },
            data: {
              totalEstimatedMinutes: { increment: item.estimatedMinutes },
              availableMinutes: { increment: item.estimatedMinutes },
            },
          }),
        ]),
  ]);

  const weekPlans = await loadWeekPlans(startOfUtcDay(new Date()));
  return NextResponse.json({ weekPlans });
}
