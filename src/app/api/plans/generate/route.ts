import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, fromDateKey, nextNDays, startOfUtcDay, toDateKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { generateWeeklyPlan, type PlanCandidate } from "@/lib/plan-generator";

function planKind(kind: string): PlanItemKind {
  if (kind === "review") {
    return "REVIEW";
  }

  if (kind === "retest") {
    return "RETEST";
  }

  return "NEW";
}

async function persistAvailability(
  availability: { date: string; availableMinutes: number; isAvailable: boolean }[],
) {
  const db = getDb();

  for (const slot of availability) {
    await db.availability.upsert({
      where: { date: fromDateKey(slot.date) },
      update: {
        availableMinutes: slot.isAvailable ? slot.availableMinutes : 0,
        isAvailable: slot.isAvailable,
      },
      create: {
        date: fromDateKey(slot.date),
        availableMinutes: slot.isAvailable ? slot.availableMinutes : 0,
        isAvailable: slot.isAvailable,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    availability?: { date: string; availableMinutes: number; isAvailable: boolean }[];
  };
  const db = getDb();
  const fallbackAvailability = nextNDays(7).map((date) => ({
    date: toDateKey(date),
    availableMinutes: 150,
    isAvailable: true,
  }));
  const availability = body.availability?.length ? body.availability : fallbackAvailability;
  await persistAvailability(availability);

  const dateKeys = availability.map((slot) => slot.date).sort();
  const firstDate = fromDateKey(dateKeys[0]);
  const lastDate = addUtcDays(fromDateKey(dateKeys[dateKeys.length - 1]), 1);

  const schedules = await db.reviewSchedule.findMany({
    where: { nextReviewDate: { lt: lastDate } },
    include: {
      problem: { include: { progress: true, sessions: { take: 1 } } },
    },
    orderBy: { nextReviewDate: "asc" },
  });
  const reviewCandidates: PlanCandidate[] = schedules.map((schedule) => ({
    problemId: schedule.problemId,
    kind: schedule.stage === 0 ? "retest" : "review",
    title: schedule.problem.titleCn,
    difficulty: schedule.problem.difficulty,
    dueDate: toDateKey(schedule.nextReviewDate),
    estimatedMinutes: schedule.problem.estimatedReviewMinutes,
    priority: schedule.nextReviewDate < startOfUtcDay(new Date()) ? 100 : 70,
  }));

  const newProblems = await db.problem.findMany({
    where: {
      isEnabled: true,
      progress: { is: { isAccepted: false } },
      reviewSchedule: null,
    },
    orderBy: { hot100Order: "asc" },
    take: 30,
  });
  const newProblemCandidates: PlanCandidate[] = newProblems.map((problem) => ({
    problemId: problem.id,
    kind: "new",
    title: problem.titleCn,
    difficulty: problem.difficulty,
    estimatedMinutes: problem.estimatedNewMinutes,
    priority: 10,
  }));

  const plan = generateWeeklyPlan({
    startDate: firstDate,
    availability,
    reviewCandidates,
    newProblemCandidates,
  });

  for (const day of plan.days) {
    const dailyPlan = await db.dailyPlan.upsert({
      where: { date: fromDateKey(day.date) },
      update: {
        availableMinutes: day.availableMinutes,
        totalEstimatedMinutes: day.totalEstimatedMinutes,
        items: { deleteMany: {} },
      },
      create: {
        date: fromDateKey(day.date),
        availableMinutes: day.availableMinutes,
        totalEstimatedMinutes: day.totalEstimatedMinutes,
      },
    });

    for (const [index, item] of day.items.entries()) {
      await db.planItem.create({
        data: {
          dailyPlanId: dailyPlan.id,
          problemId: item.problemId,
          kind: planKind(item.kind),
          estimatedMinutes: item.estimatedMinutes,
          sortOrder: index + 1,
        },
      });
    }
  }

  return NextResponse.json({ plan, unscheduled: plan.unscheduled });
}
