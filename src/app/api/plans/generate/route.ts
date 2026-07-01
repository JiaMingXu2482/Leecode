import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { addUtcDays, nextNDays, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { calculateReviewRiskScore } from "@/lib/risk";

type CandidateKind = "review" | "retest" | "new";

type Candidate = {
  problemId: string;
  kind: CandidateKind;
  estimatedMinutes: number;
};

const DEFAULT_DAILY_COUNT = 3;
const MAX_DAILY_COUNT = 30;

function planKind(kind: CandidateKind): PlanItemKind {
  if (kind === "review") return "REVIEW";
  if (kind === "retest") return "RETEST";
  return "NEW";
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    counts?: Record<string, number>;
    dailyCount?: number;
  };
  const db = getDb();
  const today = startOfUtcDay(new Date());
  const dates = nextNDays(7, today);
  const endExclusive = addUtcDays(today, 7);

  // Desired number of problems per day. Sunday is a rest day — never scheduled.
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = toDateKey(date);
    if (weekdayIndex(date) === 0) {
      counts.set(key, 0);
      continue;
    }
    const raw = body.counts?.[key];
    const value = typeof raw === "number" ? raw : body.dailyCount ?? DEFAULT_DAILY_COUNT;
    counts.set(key, Math.max(0, Math.min(MAX_DAILY_COUNT, Math.floor(value))));
  }

  // Candidates, ordered by the Ebbinghaus schedule: due/overdue reviews first
  // (earliest next-review date, then highest risk), then untouched new problems.
  const schedules = await db.reviewSchedule.findMany({
    where: { problem: { isEnabled: true } },
    include: { problem: { include: { progress: true } } },
    orderBy: { nextReviewDate: "asc" },
  });
  const reviewCandidates = schedules
    .map((schedule) => ({
      problemId: schedule.problemId,
      kind: (schedule.stage === 0 ? "retest" : "review") as CandidateKind,
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

  const queue: Candidate[] = [
    ...reviewCandidates.map(({ problemId, kind, estimatedMinutes }) => ({
      problemId,
      kind,
      estimatedMinutes,
    })),
    ...newProblems.map((problem) => ({
      problemId: problem.id,
      kind: "new" as CandidateKind,
      estimatedMinutes: problem.estimatedNewMinutes,
    })),
  ];

  // Already-completed items are kept as-is: re-planning must never delete a
  // problem the user has already done that day. Only the not-yet-done slots get
  // regenerated from the queue.
  const existingPlans = await db.dailyPlan.findMany({
    where: { date: { gte: today, lt: endExclusive } },
    include: { items: { where: { isCompleted: true }, select: { problemId: true, estimatedMinutes: true } } },
  });
  const keptByDate = new Map<string, { problemId: string; estimatedMinutes: number }[]>();
  const assigned = new Set<string>();
  for (const plan of existingPlans) {
    keptByDate.set(toDateKey(plan.date), plan.items);
    for (const item of plan.items) {
      assigned.add(item.problemId);
    }
  }

  // Walk days in order, pulling each day's remaining quota off the front of the
  // queue so earlier days get the most-due reviews first.
  let cursor = 0;
  const perDay = dates.map((date) => {
    const key = toDateKey(date);
    const kept = keptByDate.get(key) ?? [];
    const quota = counts.get(key) ?? 0;
    const remaining = Math.max(0, quota - kept.length);
    const items: Candidate[] = [];
    while (items.length < remaining && cursor < queue.length) {
      const candidate = queue[cursor];
      cursor += 1;
      if (assigned.has(candidate.problemId)) {
        continue;
      }
      assigned.add(candidate.problemId);
      items.push(candidate);
    }
    return { date, kept, items };
  });

  for (const { date, kept, items } of perDay) {
    const keptMinutes = kept.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const totalMinutes = keptMinutes + items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const dailyPlan = await db.dailyPlan.upsert({
      where: { date },
      update: {
        availableMinutes: totalMinutes,
        totalEstimatedMinutes: totalMinutes,
        items: { deleteMany: { isCompleted: false } },
      },
      create: {
        date,
        availableMinutes: totalMinutes,
        totalEstimatedMinutes: totalMinutes,
      },
    });

    let sortOrder = kept.length + 1;
    for (const item of items) {
      await db.planItem.create({
        data: {
          dailyPlanId: dailyPlan.id,
          problemId: item.problemId,
          kind: planKind(item.kind),
          estimatedMinutes: item.estimatedMinutes,
          sortOrder,
        },
      });
      sortOrder += 1;
    }
  }

  const acceptedProgress = await db.problem.findMany({
    where: { progress: { is: { isAccepted: true } } },
    include: { progress: true, reviewSchedule: true },
  });

  // Recompute risk scores in a single batched transaction instead of one
  // sequential write per problem (much faster on each regenerate).
  await db.$transaction(
    acceptedProgress.map((problem) =>
      db.problemProgress.update({
        where: { problemId: problem.id },
        data: {
          reviewRiskScore: calculateReviewRiskScore({
            acceptedRate: problem.progress?.acceptedRate ?? 0,
            totalSubmissions: problem.progress?.totalSubmissions ?? 0,
            lastAcceptedAt: problem.progress?.lastAcceptedAt ?? null,
            nextReviewDate: problem.reviewSchedule?.nextReviewDate ?? null,
            difficulty: problem.difficulty,
          }),
        },
      }),
    ),
  );

  const weekDailyPlans = await db.dailyPlan.findMany({
    where: { date: { gte: today, lt: endExclusive } },
    orderBy: { date: "asc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          problem: {
            select: {
              id: true,
              frontendId: true,
              titleCn: true,
              difficulty: true,
              leetcodeCnUrl: true,
            },
          },
        },
      },
    },
  });
  const weekPlans = weekDailyPlans.map((plan) => ({
    date: toDateKey(plan.date),
    totalEstimatedMinutes: plan.totalEstimatedMinutes,
    items: plan.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      estimatedMinutes: item.estimatedMinutes,
      isCompleted: item.isCompleted,
      problem: {
        id: item.problem.id,
        frontendId: item.problem.frontendId,
        titleCn: item.problem.titleCn,
        difficulty: item.problem.difficulty,
        leetcodeCnUrl: item.problem.leetcodeCnUrl,
      },
    })),
  }));

  return NextResponse.json({ weekPlans });
}
