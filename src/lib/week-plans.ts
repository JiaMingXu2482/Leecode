import { addUtcDays, toDateKey } from "@/lib/dates";
import { getDb } from "@/lib/db";

// Shape returned to the weekly view. Mirrors what /api/plans/generate returns so
// the client can setPlans() after a defer / append-one without a full reload.
export async function loadWeekPlans(today: Date) {
  const db = getDb();
  const [weekDailyPlans, recentSessions] = await Promise.all([
    db.dailyPlan.findMany({
      where: { date: { gte: today, lt: addUtcDays(today, 7) } },
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
