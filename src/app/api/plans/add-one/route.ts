import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { addUtcDays, fromDateKey, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadWeekPlans } from "@/lib/week-plans";

// Append one more problem to a single day's plan — the next most-due review, or
// the next untouched new problem — without regenerating the whole week.
export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { date?: string };
  if (!body.date || Number.isNaN(fromDateKey(body.date).getTime())) {
    return NextResponse.json({ error: "日期无效" }, { status: 400 });
  }

  const date = fromDateKey(body.date);
  if (weekdayIndex(date) === 0) {
    return NextResponse.json({ error: "周日休息，不排题" }, { status: 400 });
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());

  // Candidate queue, same ordering as the weekly generator: due/overdue reviews
  // first (earliest next-review, then highest risk), then untouched new problems.
  const schedules = await db.reviewSchedule.findMany({
    where: { problem: { isEnabled: true } },
    include: { problem: { include: { progress: true } } },
    orderBy: { nextReviewDate: "asc" },
  });
  const reviewCandidates = schedules
    .map((schedule) => ({
      problemId: schedule.problemId,
      kind: (schedule.stage === 0 ? PlanItemKind.RETEST : PlanItemKind.REVIEW),
      estimatedMinutes: schedule.problem.estimatedReviewMinutes,
      dueAt: schedule.nextReviewDate.getTime(),
      risk: schedule.problem.progress?.reviewRiskScore ?? 0,
    }))
    .sort((a, b) => a.dueAt - b.dueAt || b.risk - a.risk);

  const newProblems = await db.problem.findMany({
    where: {
      isEnabled: true,
      reviewSchedule: null,
      OR: [{ progress: null }, { progress: { is: { isAccepted: false } } }],
    },
    orderBy: { hot100Order: "asc" },
    take: 120,
  });

  const queue = [
    ...reviewCandidates.map(({ problemId, kind, estimatedMinutes }) => ({
      problemId,
      kind,
      estimatedMinutes,
    })),
    ...newProblems.map((problem) => ({
      problemId: problem.id,
      kind: PlanItemKind.NEW,
      estimatedMinutes: problem.estimatedNewMinutes,
    })),
  ];

  // Skip anything already scheduled anywhere in the current week to avoid dupes.
  const existing = await db.planItem.findMany({
    where: { dailyPlan: { date: { gte: today, lt: addUtcDays(today, 7) } } },
    select: { problemId: true },
  });
  const assigned = new Set(existing.map((row) => row.problemId));
  const pick = queue.find((candidate) => !assigned.has(candidate.problemId));

  if (!pick) {
    return NextResponse.json({ error: "没有可追加的题目了" }, { status: 400 });
  }

  const plan = await db.dailyPlan.upsert({
    where: { date },
    update: {},
    create: { date, availableMinutes: 0, totalEstimatedMinutes: 0 },
  });
  const maxSort = await db.planItem.aggregate({
    where: { dailyPlanId: plan.id },
    _max: { sortOrder: true },
  });

  await db.$transaction([
    db.planItem.create({
      data: {
        dailyPlanId: plan.id,
        problemId: pick.problemId,
        kind: pick.kind,
        estimatedMinutes: pick.estimatedMinutes,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    }),
    db.dailyPlan.update({
      where: { id: plan.id },
      data: {
        totalEstimatedMinutes: { increment: pick.estimatedMinutes },
        availableMinutes: { increment: pick.estimatedMinutes },
      },
    }),
  ]);

  const weekPlans = await loadWeekPlans(today);
  return NextResponse.json({ weekPlans });
}
