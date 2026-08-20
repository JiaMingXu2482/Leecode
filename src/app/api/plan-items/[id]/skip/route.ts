import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { deletePlanItemsRestoringMinutes, loadWeekPlans } from "@/lib/week-plans";

// 「不做此题」：用户打开题目后发现看不懂或太难，决定这道题不做了。
// 和 defer（顺延一天）不同 —— 这是永久跳过：把题设为不刷，并从今天及以后所有
// 未完成的计划项里移除，否则明天排题又会把它挑回来。
// 已完成的记录不动，isEnabled 随时可以在刷题计划页勾回来。
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
    include: { problem: { select: { id: true, titleCn: true } } },
  });

  if (!item) {
    return NextResponse.json({ error: "计划项不存在" }, { status: 404 });
  }

  await db.problem.update({
    where: { id: item.problemId },
    data: { isEnabled: false },
  });
  // 这道题不再进复习循环。
  await db.reviewSchedule.deleteMany({ where: { problemId: item.problemId } });
  // 今天及以后所有未完成的计划项一起清掉（这题可能已经被排到后面几天）。
  await deletePlanItemsRestoringMinutes({
    problemId: item.problemId,
    isCompleted: false,
    dailyPlan: { date: { gte: startOfUtcDay(new Date()) } },
  });

  const weekPlans = await loadWeekPlans(startOfUtcDay(new Date()));
  return NextResponse.json({ weekPlans, titleCn: item.problem.titleCn });
}
