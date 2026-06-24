import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import type { PlanCandidate } from "@/lib/plan-generator";
import { selectNextTodayTask } from "@/lib/today-task-picker";

function planKind(kind: string): PlanItemKind {
  if (kind === "review") return "REVIEW";
  if (kind === "retest") return "RETEST";
  return "NEW";
}

function tags(value: string) {
  return value.split(",").filter(Boolean);
}

function daysOverdue(today: Date, dueDate: Date) {
  return Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86_400_000));
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const tomorrow = addUtcDays(today, 1);
  const todayKey = toDateKey(today);
  let slots = await db.availabilitySlot.findMany({
    where: { date: today, isAvailable: true },
    orderBy: { startTime: "asc" },
  });

  if (!slots.length) {
    const slot = await db.availabilitySlot.create({
      data: {
        id: `${todayKey}-09:00-11:30`,
        date: today,
        weekday: weekdayIndex(today),
        startTime: "09:00",
        endTime: "11:30",
        isAvailable: true,
        availableMinutes: 150,
      },
    });
    slots = [slot];
  }

  const availableMinutes = slots.reduce((sum, slot) => sum + slot.availableMinutes, 0);
  const dailyPlan = await db.dailyPlan.upsert({
    where: { date: today },
    update: { availableMinutes },
    create: {
      date: today,
      availableMinutes,
      totalEstimatedMinutes: 0,
    },
  });
  const plan = await db.dailyPlan.findUniqueOrThrow({
    where: { id: dailyPlan.id },
    include: {
      items: {
        include: { problem: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  const usedBySlot = new Map<string, number>();
  let usedWithoutSlot = 0;

  for (const item of plan.items) {
    if (item.availabilitySlotId) {
      usedBySlot.set(
        item.availabilitySlotId,
        (usedBySlot.get(item.availabilitySlotId) ?? 0) + item.estimatedMinutes,
      );
    } else {
      usedWithoutSlot += item.estimatedMinutes;
    }
  }

  const capacitySlots = slots.map((slot, index) => ({
    id: slot.id,
    remainingMinutes: Math.max(
      0,
      slot.availableMinutes - (usedBySlot.get(slot.id) ?? 0) - (index === 0 ? usedWithoutSlot : 0),
    ),
  }));

  if (capacitySlots.every((slot) => slot.remainingMinutes <= 0)) {
    return NextResponse.json({ error: "今日可用时间已排满" }, { status: 409 });
  }

  const existingProblemIds = new Set(plan.items.map((item) => item.problemId));
  const hardNewCount = plan.items.filter((item) => item.kind === "NEW" && item.problem.difficulty === "HARD").length;
  const dueSchedules = await db.reviewSchedule.findMany({
    where: { nextReviewDate: { lt: tomorrow } },
    include: { problem: { include: { progress: true } } },
  });
  const reviewCandidates: PlanCandidate[] = dueSchedules.map((schedule) => ({
    problemId: schedule.problemId,
    kind: schedule.stage === 0 ? "retest" : "review",
    title: schedule.problem.titleCn,
    difficulty: schedule.problem.difficulty,
    tags: tags(schedule.problem.tags),
    dueDate: toDateKey(schedule.nextReviewDate),
    estimatedMinutes: schedule.problem.estimatedReviewMinutes,
    priority:
      daysOverdue(today, startOfUtcDay(schedule.nextReviewDate)) * 10 +
      (schedule.problem.progress?.reviewRiskScore ?? 0),
  }));
  const riskyOldProblems = await db.problem.findMany({
    where: {
      isEnabled: true,
      progress: { is: { isAccepted: true, reviewRiskScore: { gte: 50 } } },
    },
    include: { progress: true, reviewSchedule: true },
    take: 80,
  });

  for (const problem of riskyOldProblems) {
    if (problem.reviewSchedule?.nextReviewDate && problem.reviewSchedule.nextReviewDate < tomorrow) {
      continue;
    }

    reviewCandidates.push({
      problemId: problem.id,
      kind: "retest",
      title: problem.titleCn,
      difficulty: problem.difficulty,
      tags: tags(problem.tags),
      dueDate: problem.reviewSchedule?.nextReviewDate ? toDateKey(problem.reviewSchedule.nextReviewDate) : undefined,
      estimatedMinutes: problem.estimatedReviewMinutes,
      priority: problem.progress?.reviewRiskScore ?? 0,
    });
  }

  const newProblems = await db.problem.findMany({
    where: {
      isEnabled: true,
      reviewSchedule: null,
      OR: [{ progress: null }, { progress: { is: { isAccepted: false } } }],
    },
    orderBy: { hot100Order: "asc" },
    take: 80,
  });
  const newProblemCandidates: PlanCandidate[] = newProblems.map((problem) => ({
    problemId: problem.id,
    kind: "new",
    title: problem.titleCn,
    difficulty: problem.difficulty,
    tags: tags(problem.tags),
    estimatedMinutes: problem.estimatedNewMinutes,
    priority: 10,
  }));
  const selected = selectNextTodayTask({
    reviewCandidates,
    newProblemCandidates,
    existingProblemIds,
    slots: capacitySlots,
    hardNewCount,
  });

  if (!selected) {
    return NextResponse.json({ error: "没有能放进今日剩余时间的候选题" }, { status: 409 });
  }

  const sortOrder = (plan.items.at(-1)?.sortOrder ?? 0) + 1;
  const item = await db.$transaction(async (tx) => {
    const created = await tx.planItem.create({
      data: {
        dailyPlanId: dailyPlan.id,
        availabilitySlotId: selected.slotId,
        problemId: selected.candidate.problemId,
        kind: planKind(selected.candidate.kind),
        estimatedMinutes: selected.candidate.estimatedMinutes,
        sortOrder,
      },
    });

    await tx.dailyPlan.update({
      where: { id: dailyPlan.id },
      data: {
        totalEstimatedMinutes: plan.items.reduce((sum, row) => sum + row.estimatedMinutes, 0) + selected.candidate.estimatedMinutes,
      },
    });

    return created;
  });

  return NextResponse.json({ item });
}
