import { addUtcDays, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";

const NEW_PER_DAY = 3;

// After problems are excluded (which deletes their upcoming plan items), top
// the remaining days of this week back up to NEW_PER_DAY new problems each, so
// excluding a planned problem doesn't quietly shrink a day's plan.
export async function topUpNewProblems(today: Date) {
  const db = getDb();
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const weekEndExclusive = addUtcDays(weekStart, 7);
  const [plans, weekItems, pool] = await Promise.all([
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
      where: {
        isEnabled: true,
        reviewSchedule: null,
        OR: [{ progress: null }, { progress: { is: { isAccepted: false } } }],
      },
      orderBy: { hot100Order: "asc" },
      take: 150,
    }),
  ]);

  const assigned = new Set(weekItems.map((row) => row.problemId));
  let cursor = 0;
  for (const plan of plans) {
    let newCount = plan.items.filter((item) => item.kind === "NEW").length;
    while (newCount < NEW_PER_DAY) {
      while (cursor < pool.length && assigned.has(pool[cursor].id)) {
        cursor += 1;
      }
      if (cursor >= pool.length) {
        return;
      }
      const problem = pool[cursor];
      cursor += 1;
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
      newCount += 1;
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
