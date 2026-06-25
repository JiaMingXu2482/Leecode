import { redirect } from "next/navigation";
import { addUtcDays, minutesBetween, nextNDays, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { isAuthorizedServer } from "@/lib/auth";

export async function getDashboardData() {
  if (!(await isAuthorizedServer())) {
    redirect("/login");
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const upcomingDates = nextNDays(7, today);
  const [
    todayPlan,
    availabilityRows,
    availabilitySlots,
    problems,
    syncState,
    total,
    accepted,
    dueReviews,
    sessions,
    noteCounts,
    codeCounts,
    feelingStats,
    weekDailyPlans,
  ] =
    await Promise.all([
      db.dailyPlan.findUnique({
        where: { date: today },
        include: {
          items: {
            orderBy: { sortOrder: "asc" },
            include: {
              problem: { include: { progress: true, reviewSchedule: true } },
              availabilitySlot: true,
              session: true,
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
      db.availabilitySlot.findMany({
        where: {
          date: {
            gte: today,
            lt: addUtcDays(today, 7),
          },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
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
      db.studySession.groupBy({
        by: ["problemId"],
        where: { noteMarkdown: { not: "" } },
        _count: { _all: true },
      }),
      db.leetCodeSubmission.groupBy({
        by: ["problemId"],
        _count: { _all: true },
      }),
      db.studySession.groupBy({
        by: ["problemId"],
        where: { feelingScore: { not: null } },
        _avg: { feelingScore: true },
        _count: { _all: true },
      }),
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
    ]);
  const noteCountMap = new Map(noteCounts.map((item) => [item.problemId, item._count._all]));
  const codeCountMap = new Map(codeCounts.map((item) => [item.problemId, item._count._all]));
  const feelingStatMap = new Map(
    feelingStats.map((item) => [
      item.problemId,
      { avg: item._avg.feelingScore, count: item._count._all },
    ]),
  );

  const availability = upcomingDates.map((date) => {
    const row = availabilityRows.find((item) => toDateKey(item.date) === toDateKey(date));

    return {
      date: toDateKey(date),
      weekday: weekdayIndex(date),
      isAvailable: row?.isAvailable ?? true,
      availableMinutes: row?.availableMinutes ?? 150,
    };
  });
  const slots = availabilitySlots.length
    ? availabilitySlots.map((slot) => ({
        id: slot.id,
        date: toDateKey(slot.date),
        weekday: slot.weekday,
        startTime: slot.startTime,
        endTime: slot.endTime,
        isAvailable: slot.isAvailable,
        availableMinutes: slot.availableMinutes,
      }))
    : upcomingDates.map((date) => ({
        id: `${toDateKey(date)}-09:00-11:30`,
        date: toDateKey(date),
        weekday: weekdayIndex(date),
        startTime: "09:00",
        endTime: "11:30",
        isAvailable: true,
        availableMinutes: minutesBetween("09:00", "11:30"),
      }));

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
            session: item.session
              ? {
                  feelingScore: item.session.feelingScore,
                  reviewAfterDays: item.session.reviewAfterDays,
                  noteMarkdown: item.session.noteMarkdown,
                  noteSyntax: item.session.noteSyntax,
                }
              : null,
            slot: item.availabilitySlot
              ? {
                  id: item.availabilitySlot.id,
                  date: toDateKey(item.availabilitySlot.date),
                  weekday: item.availabilitySlot.weekday,
                  startTime: item.availabilitySlot.startTime,
                  endTime: item.availabilitySlot.endTime,
                }
              : null,
            problem: {
              id: item.problem.id,
              frontendId: item.problem.frontendId,
              titleCn: item.problem.titleCn,
              slug: item.problem.slug,
              difficulty: item.problem.difficulty,
              tags: item.problem.tags,
              leetcodeCnUrl: item.problem.leetcodeCnUrl,
              noteLastBlocker: item.problem.progress?.noteLastBlocker ?? "",
              totalSubmissions: item.problem.progress?.totalSubmissions ?? 0,
              acceptedSubmissions: item.problem.progress?.acceptedSubmissions ?? 0,
              acceptedRate: item.problem.progress?.acceptedRate ?? 0,
              reviewRiskScore: item.problem.progress?.reviewRiskScore ?? 0,
            },
          })),
        }
      : null,
    weekPlans: weekDailyPlans.map((plan) => ({
      date: toDateKey(plan.date),
      totalEstimatedMinutes: plan.totalEstimatedMinutes,
      items: plan.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        estimatedMinutes: item.estimatedMinutes,
        isCompleted: item.isCompleted,
        problem: {
          id: item.problem.id,
          frontendId: item.problem.frontendId,
          titleCn: item.problem.titleCn,
          difficulty: item.problem.difficulty,
          leetcodeCnUrl: item.problem.leetcodeCnUrl,
        },
      })),
    })),
    availability,
    slots,
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
      lastAcceptedAt: problem.progress?.lastAcceptedAt?.toISOString() ?? null,
      lastSubmittedAt: problem.progress?.lastSubmittedAt?.toISOString() ?? null,
      totalSubmissions: problem.progress?.totalSubmissions ?? 0,
      acceptedSubmissions: problem.progress?.acceptedSubmissions ?? 0,
      acceptedRate: problem.progress?.acceptedRate ?? 0,
      reviewRiskScore: problem.progress?.reviewRiskScore ?? 0,
      noteCount: noteCountMap.get(problem.id) ?? 0,
      codeCount: codeCountMap.get(problem.id) ?? 0,
      avgFeelingScore: feelingStatMap.get(problem.id)?.avg ?? null,
      feelingSessionCount: feelingStatMap.get(problem.id)?.count ?? 0,
      leetcodeCnUrl: problem.leetcodeCnUrl,
    })),
    syncState: {
      status: syncState.status,
      lastSyncedAt: syncState.lastSyncedAt?.toISOString() ?? null,
      lastCodeSyncedAt: syncState.lastCodeSyncedAt?.toISOString() ?? null,
      lastError: syncState.lastError,
      lastCodeSyncError: syncState.lastCodeSyncError,
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
