import { PlanItemKind } from "@prisma/client";
import { addUtcDays, fromDateKey, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { orderDailyNewPicks } from "@/lib/new-problem-picker";
import { calculateReviewRiskScore } from "@/lib/risk";
import { getPlanSettings } from "@/lib/settings";
import { loadWeekPlans, NEW_POOL_WHERE } from "@/lib/week-plans";

type CandidateKind = "review" | "retest" | "new";
type Candidate = { problemId: string; kind: CandidateKind; estimatedMinutes: number };

function planKind(kind: CandidateKind): PlanItemKind {
  if (kind === "review") return "REVIEW";
  if (kind === "retest") return "RETEST";
  return "NEW";
}

// Full re-plan of the current week (today → Sunday): every remaining day gets
// its due reviews (overdue ones catch up on today) plus the per-day quota of
// new problems — one from each priority category first, then Hot100 order.
// Completed items are always preserved. Used by the 重排本周 button and the
// plan assistant.
export async function regenerateWeek() {
  const db = getDb();
  const settings = await getPlanSettings();
  const today = startOfUtcDay(new Date());
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7)); // Monday
  const weekEnd = addUtcDays(weekStart, 6); // Sunday
  const endExclusive = addUtcDays(weekEnd, 1);

  const windowDates: Date[] = [];
  for (let d = new Date(today); d.getTime() <= weekEnd.getTime(); d = addUtcDays(d, 1)) {
    windowDates.push(new Date(d));
  }
  if (windowDates.length === 0) {
    return loadWeekPlans(today);
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

  // Reviews land on their due day (overdue ones catch up on today); anything
  // due after this week waits for a later week.
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

  // New problems: per-day quota, priority categories first.
  const pool = await db.problem.findMany({
    where: NEW_POOL_WHERE,
    orderBy: { hot100Order: "asc" },
  });
  const newByDate = new Map<string, Candidate[]>();
  for (const date of windowDates) {
    const picks = orderDailyNewPicks(
      pool.filter((problem) => !assigned.has(problem.id)),
      settings.priorityCategories,
      settings.newPerDay,
    );
    for (const problem of picks) {
      assigned.add(problem.id);
    }
    newByDate.set(
      toDateKey(date),
      picks.map((problem) => ({
        problemId: problem.id,
        kind: "new" as CandidateKind,
        estimatedMinutes: problem.estimatedNewMinutes,
      })),
    );
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

  // Recompute risk scores in a single batched transaction.
  const acceptedProgress = await db.problem.findMany({
    where: { progress: { is: { isAccepted: true } } },
    include: { progress: true, reviewSchedule: true },
  });
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

  return loadWeekPlans(today);
}

// Add one specific problem (by its LeetCode number) to a specific day. Used by
// the plan assistant; mirrors /api/plans/add-problem.
export async function addProblemToDate(frontendId: number, dateKey: string) {
  const db = getDb();
  const date = fromDateKey(dateKey);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: `日期无效: ${dateKey}` };
  }
  const problem = await db.problem.findUnique({
    where: { frontendId },
    include: { reviewSchedule: true },
  });
  if (!problem) {
    return { ok: false, message: `找不到题号 #${frontendId}` };
  }

  const plan = await db.dailyPlan.upsert({
    where: { date },
    update: {},
    create: { date, availableMinutes: 0, totalEstimatedMinutes: 0 },
  });
  const existing = await db.planItem.findFirst({
    where: { dailyPlanId: plan.id, problemId: problem.id },
  });
  if (existing) {
    return { ok: true, message: `#${frontendId} ${problem.titleCn} 已在 ${dateKey} 的计划里` };
  }

  const kind = problem.reviewSchedule
    ? problem.reviewSchedule.stage === 0
      ? PlanItemKind.RETEST
      : PlanItemKind.REVIEW
    : PlanItemKind.NEW;
  const estimatedMinutes =
    kind === PlanItemKind.NEW ? problem.estimatedNewMinutes : problem.estimatedReviewMinutes;
  const maxSort = await db.planItem.aggregate({
    where: { dailyPlanId: plan.id },
    _max: { sortOrder: true },
  });
  await db.$transaction([
    db.planItem.create({
      data: {
        dailyPlanId: plan.id,
        problemId: problem.id,
        kind,
        estimatedMinutes,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    }),
    db.dailyPlan.update({
      where: { id: plan.id },
      data: {
        totalEstimatedMinutes: { increment: estimatedMinutes },
        availableMinutes: { increment: estimatedMinutes },
      },
    }),
  ]);
  return { ok: true, message: `已把 #${frontendId} ${problem.titleCn} 加到 ${dateKey}` };
}
