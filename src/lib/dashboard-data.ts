import { redirect } from "next/navigation";
import { addUtcDays, nextNDays, startOfUtcDay, toDateKey } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { isAuthorizedServer } from "@/lib/auth";

export async function getDashboardData() {
  if (!(await isAuthorizedServer())) {
    redirect("/login");
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const upcomingDates = nextNDays(7, today);
  const [todayPlan, availabilityRows, problems, syncState, total, accepted, dueReviews, sessions] =
    await Promise.all([
      db.dailyPlan.findUnique({
        where: { date: today },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              problem: { include: { progress: true, reviewSchedule: true } },
            },
          },
        },
      }),
      db.availability.findMany({
        where: {
          date: {
            gte: today,
            lt: addUtcDays(today, 7),
          },
        },
        orderBy: { date: "asc" },
      }),
      db.problem.findMany({
        orderBy: { hot100Order: "asc" },
        include: { progress: true, reviewSchedule: true },
      }),
      db.leetCodeSyncState.upsert({
        where: { id: "leetcode-cn" },
        update: {},
        create: { id: "leetcode-cn" },
      }),
      db.problem.count({ where: { isEnabled: true } }),
      db.problemProgress.count({ where: { isAccepted: true } }),
      db.reviewSchedule.count({ where: { nextReviewDate: { lte: today } } }),
      db.studySession.count(),
    ]);

  const availability = upcomingDates.map((date) => {
    const row = availabilityRows.find((item) => toDateKey(item.date) === toDateKey(date));

    return {
      date: toDateKey(date),
      isAvailable: row?.isAvailable ?? true,
      availableMinutes: row?.availableMinutes ?? 150,
    };
  });

  const tagMap = new Map<string, { tag: string; total: number; accepted: number }>();

  for (const problem of problems) {
    for (const tag of problem.tags.split(",").slice(0, 3)) {
      const row = tagMap.get(tag) ?? { tag, total: 0, accepted: 0 };
      row.total += 1;
      row.accepted += problem.progress?.isAccepted ? 1 : 0;
      tagMap.set(tag, row);
    }
  }

  return {
    today: toDateKey(today),
    todayPlan: todayPlan
      ? {
          date: toDateKey(todayPlan.date),
          availableMinutes: todayPlan.availableMinutes,
          totalEstimatedMinutes: todayPlan.totalEstimatedMinutes,
          items: todayPlan.items.map((item) => ({
            id: item.id,
            kind: item.kind,
            estimatedMinutes: item.estimatedMinutes,
            isCompleted: item.isCompleted,
            problem: {
              id: item.problem.id,
              frontendId: item.problem.frontendId,
              titleCn: item.problem.titleCn,
              slug: item.problem.slug,
              difficulty: item.problem.difficulty,
              tags: item.problem.tags,
              leetcodeCnUrl: item.problem.leetcodeCnUrl,
              noteLastBlocker: item.problem.progress?.noteLastBlocker ?? "",
            },
          })),
        }
      : null,
    availability,
    problems: problems.map((problem) => ({
      id: problem.id,
      frontendId: problem.frontendId,
      titleCn: problem.titleCn,
      slug: problem.slug,
      difficulty: problem.difficulty,
      tags: problem.tags,
      isEnabled: problem.isEnabled,
      isAccepted: problem.progress?.isAccepted ?? false,
      mastery: problem.progress?.mastery ?? null,
      nextReviewDate: problem.reviewSchedule?.nextReviewDate
        ? toDateKey(problem.reviewSchedule.nextReviewDate)
        : null,
      leetcodeCnUrl: problem.leetcodeCnUrl,
    })),
    syncState: {
      status: syncState.status,
      lastSyncedAt: syncState.lastSyncedAt?.toISOString() ?? null,
      lastError: syncState.lastError,
      acceptedCount: syncState.acceptedCount,
      checkedCount: syncState.checkedCount,
      hasCookie: Boolean(syncState.cookie),
    },
    stats: {
      total,
      accepted,
      dueReviews,
      sessions,
      byTag: [...tagMap.values()].sort((a, b) => b.total - a.total).slice(0, 8),
    },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
