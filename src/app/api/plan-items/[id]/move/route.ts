import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { fromDateKey, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { loadWeekPlans } from "@/lib/week-plans";

// Move a single plan item to a specific day (drag-and-drop between day columns),
// without reshuffling anything else.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { date?: string };
  if (!body.date || Number.isNaN(fromDateKey(body.date).getTime())) {
    return NextResponse.json({ error: "日期无效" }, { status: 400 });
  }
  const target = fromDateKey(body.date);
  if (weekdayIndex(target) === 0) {
    return NextResponse.json({ error: "周日休息，不排题" }, { status: 400 });
  }

  const db = getDb();
  const item = await db.planItem.findUnique({ where: { id }, include: { dailyPlan: true } });
  if (!item) {
    return NextResponse.json({ error: "计划项不存在" }, { status: 404 });
  }

  // No-op if already on that day.
  if (startOfUtcDay(item.dailyPlan.date).getTime() === target.getTime()) {
    return NextResponse.json({ weekPlans: await loadWeekPlans(startOfUtcDay(new Date())) });
  }

  const targetPlan = await db.dailyPlan.upsert({
    where: { date: target },
    update: {},
    create: { date: target, availableMinutes: 0, totalEstimatedMinutes: 0 },
  });
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

  return NextResponse.json({ weekPlans: await loadWeekPlans(startOfUtcDay(new Date())) });
}
