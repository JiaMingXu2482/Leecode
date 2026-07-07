import { addUtcDays, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { orderDailyNewPicks } from "@/lib/new-problem-picker";
import { getPlanSettings } from "@/lib/settings";

// "New" = not yet studied in this app; a historical LeetCode AC doesn't count.
export const NEW_POOL_WHERE = {
  isEnabled: true,
  reviewSchedule: null,
  sessions: { none: {} },
} as const;

// Self-healing daily plan, run when the dashboard loads: make sure TODAY has
// all due/overdue reviews and NEW_PER_DAY new problems. Idempotent and purely
// additive — it never deletes or moves anything the user arranged, and skips
// problems already planned anywhere this week (e.g. dragged to another day).
// Without this, a new day (or one after a skipped rest day) kept whatever plan
// happened to exist until the user manually hit 重排本周.
let ensureInFlight: Promise<void> | null = null;

export function ensureTodayPlan(today: Date) {
  if (!ensureInFlight) {
    ensureInFlight = doEnsureTodayPlan(today).finally(() => {
      ensureInFlight = null;
    });
  }
  return ensureInFlight;
}

async function doEnsureTodayPlan(today: Date) {
  const db = getDb();
  const tomorrow = addUtcDays(today, 1);
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const weekEndExclusive = addUtcDays(weekStart, 7);

  const [settings, weekItems, dueSchedules, todayPlanRow] = await Promise.all([
    getPlanSettings(),
    db.planItem.findMany({
      where: { dailyPlan: { date: { gte: weekStart, lt: weekEndExclusive } } },
      select: { problemId: true },
    }),
    db.reviewSchedule.findMany({
      where: { nextReviewDate: { lt: tomorrow }, problem: { isEnabled: true } },
      include: { problem: { select: { estimatedReviewMinutes: true } } },
      orderBy: { nextReviewDate: "asc" },
    }),
    db.dailyPlan.findUnique({
      where: { date: today },
      include: { items: { select: { kind: true, sortOrder: true } } },
    }),
  ]);

  const planned = new Set(weekItems.map((row) => row.problemId));
  const missingReviews = dueSchedules.filter((schedule) => !planned.has(schedule.problemId));
  const todayNewCount = todayPlanRow?.items.filter((item) => item.kind === "NEW").length ?? 0;
  const newNeeded = Math.max(0, settings.newPerDay - todayNewCount);

  // Fast path: today is already fully planned.
  if (todayPlanRow && !missingReviews.length && newNeeded === 0) {
    return;
  }

  const plan =
    todayPlanRow ??
    (await db.dailyPlan.create({
      data: { date: today, availableMinutes: 0, totalEstimatedMinutes: 0 },
    }));
  let sortOrder = (todayPlanRow?.items ?? []).reduce((max, item) => Math.max(max, item.sortOrder), 0);
  let addedMinutes = 0;

  for (const schedule of missingReviews) {
    sortOrder += 1;
    addedMinutes += schedule.problem.estimatedReviewMinutes;
    await db.planItem.create({
      data: {
        dailyPlanId: plan.id,
        problemId: schedule.problemId,
        kind: schedule.stage === 0 ? "RETEST" : "REVIEW",
        estimatedMinutes: schedule.problem.estimatedReviewMinutes,
        sortOrder,
      },
    });
    planned.add(schedule.problemId);
  }

  if (newNeeded > 0) {
    const pool = await db.problem.findMany({
      where: NEW_POOL_WHERE,
      orderBy: { hot100Order: "asc" },
    });
    const picks = orderDailyNewPicks(
      pool.filter((problem) => !planned.has(problem.id)),
      settings.priorityCategories,
      newNeeded,
    );
    for (const problem of picks) {
      planned.add(problem.id);
      sortOrder += 1;
      addedMinutes += problem.estimatedNewMinutes;
      await db.planItem.create({
        data: {
          dailyPlanId: plan.id,
          problemId: problem.id,
          kind: "NEW",
          estimatedMinutes: problem.estimatedNewMinutes,
          sortOrder,
        },
      });
    }
  }

  if (addedMinutes > 0) {
    await db.dailyPlan.update({
      where: { id: plan.id },
      data: {
        totalEstimatedMinutes: { increment: addedMinutes },
        availableMinutes: { increment: addedMinutes },
      },
    });
  }
}

// After problems are excluded (which deletes their upcoming plan items), top
// the remaining days of this week back up to the per-day new-problem quota, so
// excluding a planned problem doesn't quietly shrink a day's plan.
export async function topUpNewProblems(today: Date) {
  const db = getDb();
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const weekEndExclusive = addUtcDays(weekStart, 7);
  const [settings, plans, weekItems, pool] = await Promise.all([
    getPlanSettings(),
    db.dailyPlan.findMany({
      where: { date: { gte: today, lt: weekEndExclusive } },
      include: { items: { select: { kind: true } } },
      orderBy: { date: "asc" },
    }),
    db.planItem.findMany({
      where: { dailyPlan: { date: { gte: weekStart, lt: weekEndExclusive } } },
      select: { problemId: true },
    }),
    db.problem.findMany({
      where: NEW_POOL_WHERE,
      orderBy: { hot100Order: "asc" },
    }),
  ]);

  const assigned = new Set(weekItems.map((row) => row.problemId));
  for (const plan of plans) {
    const newCount = plan.items.filter((item) => item.kind === "NEW").length;
    const needed = Math.max(0, settings.newPerDay - newCount);
    if (needed === 0) {
      continue;
    }
    const picks = orderDailyNewPicks(
      pool.filter((problem) => !assigned.has(problem.id)),
      settings.priorityCategories,
      needed,
    );
    if (!picks.length) {
      return;
    }
    for (const problem of picks) {
      assigned.add(problem.id);
      const maxSort = await db.planItem.aggregate({
        where: { dailyPlanId: plan.id },
        _max: { sortOrder: true },
      });
      await db.$transaction([
        db.planItem.create({
          data: {
            dailyPlanId: plan.id,
            problemId: problem.id,
            kind: "NEW",
            estimatedMinutes: problem.estimatedNewMinutes,
            sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
          },
        }),
        db.dailyPlan.update({
          where: { id: plan.id },
          data: {
            totalEstimatedMinutes: { increment: problem.estimatedNewMinutes },
            availableMinutes: { increment: problem.estimatedNewMinutes },
          },
        }),
      ]);
    }
  }
}

// Shape returned to the weekly view (current calendar week, Monday–Sunday).
// Mirrors dashboard-data's weekPlans so the client can setPlans() after a
// move / append / add without a full reload.
export async function loadWeekPlans(today: Date) {
  const db = getDb();
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const [weekDailyPlans, recentSessions] = await Promise.all([
    db.dailyPlan.findMany({
      where: { date: { gte: weekStart, lt: addUtcDays(weekStart, 7) } },
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
    }),
    db.studySession.findMany({
      where: { completedAt: { gte: addUtcDays(today, -13) } },
      select: { problemId: true, completedAt: true },
    }),
  ]);

  // A planned problem counts as done if it was studied that day (survives a
  // re-plan), matching how the dashboard loader derives completion.
  const sessionDayKeys = new Set(
    recentSessions.map((session) => `${session.problemId}|${toDateKey(session.completedAt)}`),
  );

  return weekDailyPlans.map((plan) => {
    const dateKey = toDateKey(plan.date);
    return {
      date: dateKey,
      totalEstimatedMinutes: plan.totalEstimatedMinutes,
      items: plan.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        estimatedMinutes: item.estimatedMinutes,
        isCompleted: item.isCompleted || sessionDayKeys.has(`${item.problemId}|${dateKey}`),
        problem: {
          id: item.problem.id,
          frontendId: item.problem.frontendId,
          titleCn: item.problem.titleCn,
          difficulty: item.problem.difficulty,
          leetcodeCnUrl: item.problem.leetcodeCnUrl,
        },
      })),
    };
  });
}
