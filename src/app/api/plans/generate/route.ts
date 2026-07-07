import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { addUtcDays, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { calculateReviewRiskScore } from "@/lib/risk";
import { loadWeekPlans, NEW_PER_DAY } from "@/lib/week-plans";

type CandidateKind = "review" | "retest" | "new";
type Candidate = { problemId: string; kind: CandidateKind; estimatedMinutes: number };

function planKind(kind: CandidateKind): PlanItemKind {
  if (kind === "review") return "REVIEW";
  if (kind === "retest") return "RETEST";
  return "NEW";
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7)); // Monday
  const weekEnd = addUtcDays(weekStart, 6); // Sunday
  const endExclusive = addUtcDays(weekEnd, 1);

  // Plan the remaining days of this week: today → Sunday.
  const windowDates: Date[] = [];
  for (let d = new Date(today); d.getTime() <= weekEnd.getTime(); d = addUtcDays(d, 1)) {
    windowDates.push(new Date(d));
  }
  if (windowDates.length === 0) {
    return NextResponse.json({ weekPlans: await loadWeekPlans(today) });
  }
  const firstKey = toDateKey(windowDates[0]);
  const lastKey = toDateKey(weekEnd);

  // Preserve already-completed items — re-planning must never drop done work.
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

  // Reviews land on their due day (overdue ones catch up on today); anything due
  // after this week waits for a later week.
  const schedules = await db.reviewSchedule.findMany({
    where: { problem: { isEnabled: true } },
    include: { problem: { select: { estimatedReviewMinutes: true } } },
    orderBy: { nextReviewDate: "asc" },
  });
  const reviewsByDate = new Map<string, Candidate[]>();
  for (const schedule of schedules) {
    if (assigned.has(schedule.problemId)) {
      continue;
    }
    let dueKey = toDateKey(startOfUtcDay(schedule.nextReviewDate));
    if (dueKey < firstKey) {
      dueKey = firstKey; // overdue → today
    }
    if (dueKey > lastKey) {
      continue;
    }
    assigned.add(schedule.problemId);
    const list = reviewsByDate.get(dueKey) ?? [];
    list.push({
      problemId: schedule.problemId,
      kind: schedule.stage === 0 ? "retest" : "review",
      estimatedMinutes: schedule.problem.estimatedReviewMinutes,
    });
    reviewsByDate.set(dueKey, list);
  }

  // New problems: NEW_PER_DAY per study day, in Hot100 order. "New" means not
  // yet studied IN THIS APP (no review schedule, no session) — being accepted
  // on LeetCode historically does not exclude a problem from the redo plan.
  const newProblems = await db.problem.findMany({
    where: {
      isEnabled: true,
      reviewSchedule: null,
      sessions: { none: {} },
    },
    orderBy: { hot100Order: "asc" },
    take: windowDates.length * NEW_PER_DAY + 20,
  });
  const newByDate = new Map<string, Candidate[]>();
  let cursor = 0;
  for (const date of windowDates) {
    const list: Candidate[] = [];
    while (list.length < NEW_PER_DAY && cursor < newProblems.length) {
      const problem = newProblems[cursor];
      cursor += 1;
      if (assigned.has(problem.id)) {
        continue;
      }
      assigned.add(problem.id);
      list.push({ problemId: problem.id, kind: "new", estimatedMinutes: problem.estimatedNewMinutes });
    }
    newByDate.set(toDateKey(date), list);
  }

  for (const date of windowDates) {
    const key = toDateKey(date);
    const kept = keptByDate.get(key) ?? [];
    const fresh = [...(reviewsByDate.get(key) ?? []), ...(newByDate.get(key) ?? [])];
    const keptMinutes = kept.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const totalMinutes = keptMinutes + fresh.reduce((sum, item) => sum + item.estimatedMinutes, 0);
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
    for (const item of fresh) {
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

  // Recompute risk scores in a single batched transaction.
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

  return NextResponse.json({ weekPlans: await loadWeekPlans(today) });
}
