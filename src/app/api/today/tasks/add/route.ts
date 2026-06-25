import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, startOfUtcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const tomorrow = addUtcDays(today, 1);
  const dailyPlan = await db.dailyPlan.upsert({
    where: { date: today },
    update: {},
    create: { date: today, availableMinutes: 0, totalEstimatedMinutes: 0 },
  });
  const existing = await db.planItem.findMany({
    where: { dailyPlanId: dailyPlan.id },
    select: { problemId: true, sortOrder: true, estimatedMinutes: true },
  });
  const existingIds = new Set(existing.map((item) => item.problemId));

  // Next problem by the Ebbinghaus schedule: due/overdue reviews first, then a
  // new problem in Hot100 order. Skip ones already on today's plan.
  const dueSchedules = await db.reviewSchedule.findMany({
    where: { nextReviewDate: { lt: tomorrow }, problem: { isEnabled: true } },
    include: { problem: { include: { progress: true } } },
    orderBy: { nextReviewDate: "asc" },
  });

  let pickProblemId: string | null = null;
  let pickKind: PlanItemKind = "NEW";
  let pickMinutes = 0;

  for (const schedule of dueSchedules) {
    if (existingIds.has(schedule.problemId)) {
      continue;
    }
    pickProblemId = schedule.problemId;
    pickKind = schedule.stage === 0 ? "RETEST" : "REVIEW";
    pickMinutes = schedule.problem.estimatedReviewMinutes;
    break;
  }

  if (!pickProblemId) {
    const newProblems = await db.problem.findMany({
      where: {
        isEnabled: true,
        reviewSchedule: null,
        OR: [{ progress: null }, { progress: { is: { isAccepted: false } } }],
      },
      orderBy: { hot100Order: "asc" },
      take: 200,
    });
    const next = newProblems.find((problem) => !existingIds.has(problem.id));
    if (next) {
      pickProblemId = next.id;
      pickKind = "NEW";
      pickMinutes = next.estimatedNewMinutes;
    }
  }

  if (!pickProblemId) {
    return NextResponse.json({ error: "没有可以再添加的题目了" }, { status: 409 });
  }

  const sortOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1;
  const usedMinutes = existing.reduce((sum, item) => sum + item.estimatedMinutes, 0);

  const item = await db.$transaction(async (tx) => {
    const created = await tx.planItem.create({
      data: {
        dailyPlanId: dailyPlan.id,
        problemId: pickProblemId,
        kind: pickKind,
        estimatedMinutes: pickMinutes,
        sortOrder,
      },
    });
    await tx.dailyPlan.update({
      where: { id: dailyPlan.id },
      data: { totalEstimatedMinutes: usedMinutes + pickMinutes },
    });
    return created;
  });

  return NextResponse.json({ item });
}
