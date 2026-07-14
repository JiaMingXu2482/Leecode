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

// How far back the carry-over sweep looks for unfinished NEW items. Debt older
// than this is stale (its problems are still in the new pool and get re-picked
// naturally), so we don't dump weeks-old items onto today at once.
const CARRY_WINDOW_DAYS = 14;

// Backlog caps: a skipped day must NOT bury today (the user once came back to
// a 27-item Monday). Carried new problems stack at most CARRY_PER_DAY per day
// on top of the quota (oldest debt first; the rest waits for the next days),
// and a day holds at most MAX_REVIEWS_PER_DAY reviews (most overdue first;
// the overflow trickles into the following days).
export const CARRY_PER_DAY = 2;
export const MAX_REVIEWS_PER_DAY = 10;

// Deletes plan items and gives their estimated minutes back to the owning
// daily plans in the same transaction — every deletion path must go through
// this, or the plans' totalEstimatedMinutes/availableMinutes drift upward
// forever (deleteMany alone can't touch the parent rows).
export async function deletePlanItemsRestoringMinutes(
  where: NonNullable<Parameters<ReturnType<typeof getDb>["planItem"]["findMany"]>[0]>["where"],
) {
  const db = getDb();
  const items = await db.planItem.findMany({
    where,
    select: { id: true, dailyPlanId: true, estimatedMinutes: true },
  });
  if (!items.length) {
    return 0;
  }
  const minutesByPlan = new Map<string, number>();
  for (const item of items) {
    minutesByPlan.set(item.dailyPlanId, (minutesByPlan.get(item.dailyPlanId) ?? 0) + item.estimatedMinutes);
  }
  await db.$transaction([
    db.planItem.deleteMany({ where: { id: { in: items.map((item) => item.id) } } }),
    ...[...minutesByPlan.entries()].map(([planId, minutes]) =>
      db.dailyPlan.update({
        where: { id: planId },
        data: {
          totalEstimatedMinutes: { decrement: minutes },
          availableMinutes: { decrement: minutes },
        },
      }),
    ),
  ]);
  return items.length;
}

// Self-healing daily plan, run when the dashboard loads: make sure TODAY has
// all due/overdue reviews and NEW_PER_DAY new problems, and carry unfinished
// NEW items from previous days forward onto today (stacked on top of the
// quota — the user wants yesterday's debt visible today, e.g. 4 own + 2
// carried = 6). Idempotent, and never touches anything the user completed.
// Without this, a new day (or one after a skipped rest day) kept whatever plan
// happened to exist until the user manually hit 重排本周.
// The in-flight cache is keyed by the day so a request racing across midnight
// can't latch onto the PREVIOUS day's run and skip its own.
let ensureInFlight: { key: string; promise: Promise<void> } | null = null;

export function ensureTodayPlan(today: Date) {
  const key = toDateKey(today);
  if (!ensureInFlight || ensureInFlight.key !== key) {
    const promise = doEnsureTodayPlan(today).finally(() => {
      if (ensureInFlight?.promise === promise) {
        ensureInFlight = null;
      }
    });
    ensureInFlight = { key, promise };
  }
  return ensureInFlight.promise;
}

async function doEnsureTodayPlan(today: Date) {
  const db = getDb();
  const tomorrow = addUtcDays(today, 1);
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const weekEndExclusive = addUtcDays(weekStart, 7);

  const [settings, weekItems, dueSchedules, todayPlanRow, carryCandidates] = await Promise.all([
    getPlanSettings(),
    db.planItem.findMany({
      where: { dailyPlan: { date: { gte: weekStart, lt: weekEndExclusive } } },
      select: { problemId: true, dailyPlan: { select: { date: true } } },
    }),
    db.reviewSchedule.findMany({
      where: { nextReviewDate: { lt: tomorrow }, problem: { isEnabled: true } },
      include: { problem: { select: { estimatedReviewMinutes: true } } },
      orderBy: { nextReviewDate: "asc" },
    }),
    db.dailyPlan.findUnique({
      where: { date: today },
      include: { items: { select: { kind: true, sortOrder: true, carriedFromDate: true } } },
    }),
    // Unfinished NEW items from previous days — yesterday's (or a skipped
    // stretch's) debt. Oldest first: the day's carry allowance goes to the
    // longest-waiting problems, the rest stay put for the following days.
    db.planItem.findMany({
      where: {
        kind: "NEW",
        isCompleted: false,
        dailyPlan: { date: { gte: addUtcDays(today, -CARRY_WINDOW_DAYS), lt: today } },
      },
      select: {
        id: true,
        problemId: true,
        estimatedMinutes: true,
        carriedFromDate: true,
        dailyPlan: { select: { id: true, date: true } },
        problem: {
          select: {
            isEnabled: true,
            reviewSchedule: { select: { id: true } },
            sessions: { select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: [{ dailyPlan: { date: "asc" } }, { sortOrder: "asc" }],
    }),
  ]);

  const planned = new Set(weekItems.map((row) => row.problemId));
  // Problems already planned today or later — debt for these is already
  // rescheduled, so the stale past item just gets dropped instead of carried.
  const plannedTodayOnward = new Set(
    weekItems
      .filter((row) => row.dailyPlan.date.getTime() >= today.getTime())
      .map((row) => row.problemId),
  );
  // Reviews: dueSchedules is ordered by nextReviewDate asc, so after a skipped
  // day the most-overdue catch-ups win today's capped slots and the rest stay
  // due — tomorrow's run picks them up, and so on (trickle, not a landslide).
  const todayReviewCount = todayPlanRow?.items.filter((item) => item.kind !== "NEW").length ?? 0;
  const reviewAllowance = Math.max(0, MAX_REVIEWS_PER_DAY - todayReviewCount);
  const missingReviews = dueSchedules
    .filter((schedule) => !planned.has(schedule.problemId))
    .slice(0, reviewAllowance);
  // Manual drags are the last word: once today's new quota has been auto-filled
  // once, we never auto-add new/carried problems to it again. So if the user
  // drags today's new problems to later days and reopens today, the system
  // does NOT quietly refill it. Reviews (due-date driven) still trickle in.
  const shouldFillNew = !todayPlanRow?.newFilledAt;
  // Only the day's own picks count toward the quota; carried debt stacks on top.
  const todayNewCount =
    todayPlanRow?.items.filter((item) => item.kind === "NEW" && !item.carriedFromDate).length ?? 0;
  const newNeeded = shouldFillNew ? Math.max(0, settings.newPerDay - todayNewCount) : 0;
  // Carried debt already sitting on today counts against today's carry cap.
  const todayCarriedCount =
    todayPlanRow?.items.filter((item) => item.kind === "NEW" && item.carriedFromDate).length ?? 0;
  let carryAllowance = shouldFillNew ? Math.max(0, CARRY_PER_DAY - todayCarriedCount) : 0;

  // Fast path: today exists, its new quota is already settled (or the user
  // arranged it), and no review is waiting to be added.
  if (todayPlanRow && !missingReviews.length && !shouldFillNew) {
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

  // Carry unfinished NEW debt onto today BEFORE picking fresh problems, so a
  // carried problem can't also be re-picked as one of today's own. Debt whose
  // problem was studied since, entered the review cycle, got disabled, or is
  // already planned today/later is stale — delete the old item instead. Only
  // CARRY_PER_DAY problems move today (oldest first); the rest stay on their
  // past plans and later days keep draining them.
  for (const item of carryCandidates) {
    const stale =
      !item.problem.isEnabled ||
      item.problem.reviewSchedule !== null ||
      item.problem.sessions.length > 0 ||
      plannedTodayOnward.has(item.problemId);
    const sourcePlanUpdate = db.dailyPlan.update({
      where: { id: item.dailyPlan.id },
      data: {
        totalEstimatedMinutes: { decrement: item.estimatedMinutes },
        availableMinutes: { decrement: item.estimatedMinutes },
      },
    });
    if (stale) {
      await db.$transaction([db.planItem.delete({ where: { id: item.id } }), sourcePlanUpdate]);
      continue;
    }
    if (carryAllowance <= 0) {
      continue;
    }
    carryAllowance -= 1;
    sortOrder += 1;
    addedMinutes += item.estimatedMinutes;
    await db.$transaction([
      db.planItem.update({
        where: { id: item.id },
        data: {
          dailyPlanId: plan.id,
          sortOrder,
          // Keep the ORIGINAL date across repeated carries (7/9 → 7/10 → 7/11
          // still reads 顺延自7/9).
          carriedFromDate: item.carriedFromDate ?? item.dailyPlan.date,
        },
      }),
      sourcePlanUpdate,
    ]);
    plannedTodayOnward.add(item.problemId);
    planned.add(item.problemId);
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

  // Stamp newFilledAt whenever we were in fill mode (even if nothing was added,
  // e.g. the pool is empty) so the auto-fill runs exactly once for this day.
  if (addedMinutes > 0 || shouldFillNew) {
    await db.dailyPlan.update({
      where: { id: plan.id },
      data: {
        ...(addedMinutes > 0
          ? {
              totalEstimatedMinutes: { increment: addedMinutes },
              availableMinutes: { increment: addedMinutes },
            }
          : {}),
        ...(shouldFillNew ? { newFilledAt: new Date() } : {}),
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
      include: { items: { select: { kind: true, carriedFromDate: true } } },
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
    // Carried debt stacks on top of the quota; only own picks count against it.
    const newCount = plan.items.filter((item) => item.kind === "NEW" && !item.carriedFromDate).length;
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
    const maxSort = await db.planItem.aggregate({
      where: { dailyPlanId: plan.id },
      _max: { sortOrder: true },
    });
    const baseSort = maxSort._max.sortOrder ?? 0;
    const addedMinutes = picks.reduce((sum, problem) => sum + problem.estimatedNewMinutes, 0);
    for (const problem of picks) {
      assigned.add(problem.id);
    }
    await db.$transaction([
      db.planItem.createMany({
        data: picks.map((problem, index) => ({
          dailyPlanId: plan.id,
          problemId: problem.id,
          kind: "NEW" as const,
          estimatedMinutes: problem.estimatedNewMinutes,
          sortOrder: baseSort + 1 + index,
        })),
      }),
      db.dailyPlan.update({
        where: { id: plan.id },
        data: {
          totalEstimatedMinutes: { increment: addedMinutes },
          availableMinutes: { increment: addedMinutes },
        },
      }),
    ]);
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
        carriedFromDate: item.carriedFromDate ? toDateKey(item.carriedFromDate) : null,
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
