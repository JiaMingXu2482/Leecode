import { PlanItemKind } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import {
  addUtcDays,
  fromDateKey,
  minutesBetween,
  nextNDays,
  startOfUtcDay,
  toDateKey,
  weekdayIndex,
} from "@/lib/dates";
import { getDb } from "@/lib/db";
import {
  generateWeeklyPlan,
  type AvailabilitySlotInput,
  type PlanCandidate,
} from "@/lib/plan-generator";
import { calculateReviewRiskScore } from "@/lib/risk";

type SlotPayload = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

function planKind(kind: string): PlanItemKind {
  if (kind === "review") return "REVIEW";
  if (kind === "retest") return "RETEST";
  return "NEW";
}

function normalizeSlot(slot: SlotPayload): AvailabilitySlotInput & { weekday: number } {
  const date = fromDateKey(slot.date);

  return {
    id: slot.id ?? `${slot.date}-${slot.startTime}-${slot.endTime}`,
    date: slot.date,
    weekday: weekdayIndex(date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    isAvailable: slot.isAvailable,
    availableMinutes: slot.isAvailable ? minutesBetween(slot.startTime, slot.endTime) : 0,
  };
}

function defaultSlots(): (AvailabilitySlotInput & { weekday: number })[] {
  return nextNDays(7).map((date) => {
    const dateKey = toDateKey(date);

    return {
      id: `${dateKey}-09:00-11:30`,
      date: dateKey,
      weekday: weekdayIndex(date),
      startTime: "09:00",
      endTime: "11:30",
      isAvailable: true,
      availableMinutes: 150,
    };
  });
}

async function persistSlots(slots: (AvailabilitySlotInput & { weekday: number })[]) {
  const db = getDb();

  for (const slot of slots) {
    await db.availabilitySlot.upsert({
      where: { id: slot.id },
      update: {
        date: fromDateKey(slot.date),
        weekday: slot.weekday,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isAvailable: slot.isAvailable,
        availableMinutes: slot.availableMinutes,
      },
      create: {
        id: slot.id,
        date: fromDateKey(slot.date),
        weekday: slot.weekday,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isAvailable: slot.isAvailable,
        availableMinutes: slot.availableMinutes,
      },
    });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { slots?: SlotPayload[] };
  const db = getDb();
  const incomingSlots = body.slots?.length ? body.slots.map(normalizeSlot) : [];
  let slots = incomingSlots;

  if (!slots.length) {
    const today = startOfUtcDay(new Date());
    const rows = await db.availabilitySlot.findMany({
      where: { date: { gte: today, lt: addUtcDays(today, 7) } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    slots = rows.length
      ? rows.map((slot) => ({
          id: slot.id,
          date: toDateKey(slot.date),
          weekday: slot.weekday,
          startTime: slot.startTime,
          endTime: slot.endTime,
          isAvailable: slot.isAvailable,
          availableMinutes: slot.availableMinutes,
        }))
      : defaultSlots();
  }

  await persistSlots(slots);

  const dateKeys = slots.map((slot) => slot.date).sort();
  const firstDate = fromDateKey(dateKeys[0]);
  const lastDate = addUtcDays(fromDateKey(dateKeys[dateKeys.length - 1]), 1);

  const schedules = await db.reviewSchedule.findMany({
    where: { nextReviewDate: { lt: lastDate } },
    include: { problem: { include: { progress: true } } },
    orderBy: { nextReviewDate: "asc" },
  });
  const reviewCandidates: PlanCandidate[] = schedules.map((schedule) => ({
    problemId: schedule.problemId,
    kind: schedule.stage === 0 ? "retest" : "review",
    title: schedule.problem.titleCn,
    difficulty: schedule.problem.difficulty,
    tags: schedule.problem.tags.split(","),
    dueDate: toDateKey(schedule.nextReviewDate),
    estimatedMinutes: schedule.problem.estimatedReviewMinutes,
    priority: Math.max(
      schedule.nextReviewDate < startOfUtcDay(new Date()) ? 100 : 70,
      schedule.problem.progress?.reviewRiskScore ?? 0,
    ),
  }));

  const newProblems = await db.problem.findMany({
    where: {
      isEnabled: true,
      progress: { is: { isAccepted: false } },
      reviewSchedule: null,
    },
    orderBy: { hot100Order: "asc" },
    take: 40,
  });
  const newProblemCandidates: PlanCandidate[] = newProblems.map((problem) => ({
    problemId: problem.id,
    kind: "new",
    title: problem.titleCn,
    difficulty: problem.difficulty,
    tags: problem.tags.split(","),
    estimatedMinutes: problem.estimatedNewMinutes,
    priority: 10,
  }));

  const plan = generateWeeklyPlan({
    startDate: firstDate,
    availabilitySlots: slots,
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

    let sortOrder = 1;
    for (const slot of day.slots) {
      for (const item of slot.items) {
        await db.planItem.create({
          data: {
            dailyPlanId: dailyPlan.id,
            availabilitySlotId: slot.id,
            problemId: item.problemId,
            kind: planKind(item.kind),
            estimatedMinutes: item.estimatedMinutes,
            sortOrder,
          },
        });
        sortOrder += 1;
      }
    }
  }

  const acceptedProgress = await db.problem.findMany({
    where: { progress: { is: { isAccepted: true } } },
    include: { progress: true, reviewSchedule: true },
  });

  for (const problem of acceptedProgress) {
    await db.problemProgress.update({
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
    });
  }

  return NextResponse.json({ plan, unscheduled: plan.unscheduled });
}
