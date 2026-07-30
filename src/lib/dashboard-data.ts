import { redirect } from "next/navigation";
import { addUtcDays, minutesBetween, nextNDays, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { isAuthorizedServer } from "@/lib/auth";
import { ensureAcmNotesSeeded, loadAcmNotes } from "@/lib/acm-notes";
import { getPlanSettings } from "@/lib/settings";
import { ensureTodayPlan } from "@/lib/week-plans";

export type DashboardView =
  | "today"
  | "weekly"
  | "history"
  | "reviews"
  | "stats"
  | "sync"
  | "acm-notes";

// Loads ONLY what the given view renders. All views share one return shape (so
// the client component types stay unchanged), but unused heavy sections come
// back empty — e.g. the history notes (rich-text HTML, the payload hog) are
// only fetched for /history, and the 100-problem list only where it's shown.
export async function getDashboardData(view: DashboardView = "today") {
  if (!(await isAuthorizedServer())) {
    redirect("/login");
  }

  const wantToday = view === "today";
  const wantWeekly = view === "weekly";
  const wantHistory = view === "history";
  const wantProblems = wantWeekly || view === "reviews" || view === "stats";
  const wantRecent = wantToday || wantWeekly || wantHistory;
  const wantAcmNotes = view === "acm-notes";

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const upcomingDates = nextNDays(7, today);
  // Current calendar week, Monday–Sunday.
  const weekStart = addUtcDays(today, -((weekdayIndex(today) + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, index) => addUtcDays(weekStart, index));

  // Self-heal today's plan (due reviews + the daily new-problem quota) before
  // reading, so a fresh day never shows a stale or empty task list.
  if (wantToday || wantWeekly) {
    await ensureTodayPlan(today);
  }
  // First visit to the notes page gets the starter knowledge base.
  if (wantAcmNotes) {
    await ensureAcmNotesSeeded();
  }

  const planSettings = await getPlanSettings();
  const acmNotes = wantAcmNotes ? await loadAcmNotes() : [];
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
      wantToday
        ? db.dailyPlan.findUnique({
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
          })
        : Promise.resolve(null),
      wantWeekly
        ? db.availability.findMany({
            where: {
              date: {
                gte: today,
                lt: addUtcDays(today, 7),
              },
            },
            orderBy: { date: "asc" },
          })
        : Promise.resolve([]),
      // Availability slots are legacy (no view renders them); default shape only.
      Promise.resolve([] as { id: string; date: Date; weekday: number; startTime: string; endTime: string; isAvailable: boolean; availableMinutes: number }[]),
      wantProblems
        ? db.problem.findMany({
            orderBy: { hot100Order: "asc" },
            include: { progress: true, reviewSchedule: true },
          })
        : Promise.resolve([]),
      db.leetCodeSyncState.upsert({
        where: { id: "leetcode-cn" },
        update: {},
        create: { id: "leetcode-cn" },
      }),
      db.problem.count({ where: { isEnabled: true } }),
      db.problemProgress.count({ where: { isAccepted: true } }),
      db.reviewSchedule.count({ where: { nextReviewDate: { lte: today } } }),
      db.studySession.count(),
      wantProblems
        ? db.studySession.groupBy({
            by: ["problemId"],
            where: { noteMarkdown: { not: "" } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      wantProblems
        ? db.leetCodeSubmission.groupBy({
            by: ["problemId"],
            _count: { _all: true },
          })
        : Promise.resolve([]),
      wantToday || wantProblems
        ? db.studySession.groupBy({
            by: ["problemId"],
            where: { feelingScore: { not: null } },
            _avg: { feelingScore: true },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      wantWeekly
        ? db.dailyPlan.findMany({
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
          })
        : Promise.resolve([]),
    ]);
  const noteCountMap = new Map(noteCounts.map((item) => [item.problemId, item._count._all]));
  const codeCountMap = new Map(codeCounts.map((item) => [item.problemId, item._count._all]));
  const feelingStatMap = new Map(
    feelingStats.map((item) => [
      item.problemId,
      { avg: item._avg.feelingScore, count: item._count._all },
    ]),
  );

  // Batch the remaining per-request reads into one round-trip of parallel
  // queries instead of awaiting each in sequence — this page is force-dynamic,
  // so getDashboardData runs on every load and every navigation.
  const todayProblemIds = todayPlan?.items.map((item) => item.problemId) ?? [];
  const HEAT_WEEKS = 18;
  const heatStart = addUtcDays(weekStart, -7 * (HEAT_WEEKS - 1));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const [latestSessions, todayDoneSessions, recentSessions, weekProgressPlans, monthPlans, heatSessions] =
    await Promise.all([
      // Latest sessions for today's plan problems, so a regenerated plan item
      // still surfaces its history (feedback + notes). Self-gating: for other
      // views todayPlan is null, so the `in` list is empty and this returns [].
      db.studySession.findMany({
        where: { problemId: { in: todayProblemIds } },
        orderBy: { completedAt: "desc" },
      }),
      // Everything studied today (for the "done but dropped from plan" rows).
      wantToday
        ? db.studySession.findMany({
            where: { completedAt: { gte: today } },
            orderBy: { completedAt: "desc" },
            include: {
              problem: {
                select: { id: true, frontendId: true, titleCn: true, difficulty: true, leetcodeCnUrl: true },
              },
            },
          })
        : Promise.resolve([]),
      // Recent sessions: history board (weekly/history) + session-day completion
      // (today's metrics, weekly's isCompleted).
      wantRecent
        ? db.studySession.findMany({
            where: { completedAt: { gte: addUtcDays(today, -13) } },
            orderBy: { completedAt: "desc" },
            include: { problem: { select: { id: true, frontendId: true, titleCn: true, difficulty: true } } },
          })
        : Promise.resolve([]),
      // This calendar week's plans, for "本周进度（新题）".
      wantToday
        ? db.dailyPlan.findMany({
            where: { date: { gte: weekStart, lt: addUtcDays(weekStart, 7) } },
            include: { items: { select: { problemId: true, isCompleted: true, kind: true } } },
          })
        : Promise.resolve([]),
      // This month's plans, for "本月进度（新题）".
      wantToday
        ? db.dailyPlan.findMany({
            where: { date: { gte: monthStart, lt: monthEnd } },
            include: { items: { select: { problemId: true, isCompleted: true, kind: true } } },
          })
        : Promise.resolve([]),
      // Daily counts for the contribution heatmap.
      wantToday
        ? db.studySession.findMany({
            where: { completedAt: { gte: heatStart } },
            select: { completedAt: true },
          })
        : Promise.resolve([]),
    ]);
  const sessionsByProblem = new Map<string, typeof latestSessions>();
  // Today's session per problem (latest), so completion/notes survive a re-plan:
  // a task counts as done today if there's a session for it completed today,
  // regardless of which (possibly regenerated) plan item it's linked to.
  const todaySessionByProblem = new Map<string, (typeof latestSessions)[number]>();
  for (const session of latestSessions) {
    const list = sessionsByProblem.get(session.problemId) ?? [];
    list.push(session);
    sessionsByProblem.set(session.problemId, list);
    if (session.completedAt >= today && !todaySessionByProblem.has(session.problemId)) {
      todaySessionByProblem.set(session.problemId, session);
    }
  }

  // Problems studied today that are NOT in today's plan — e.g. a re-plan dropped
  // them after they were already done. Surface them so today's work never
  // disappears from the list.
  const plannedTodayIds = new Set(todayProblemIds);
  const seenExtra = new Set<string>();
  const todayExtra = todayDoneSessions
    .filter((session) => {
      if (plannedTodayIds.has(session.problemId) || seenExtra.has(session.problemId)) {
        return false;
      }
      seenExtra.add(session.problemId);
      return true;
    })
    .map((session) => ({
      problemId: session.problemId,
      frontendId: session.problem.frontendId,
      titleCn: session.problem.titleCn,
      difficulty: session.problem.difficulty,
      leetcodeCnUrl: session.problem.leetcodeCnUrl,
      kind: session.kind,
      feelingScore: session.feelingScore,
      avgFeelingScore: feelingStatMap.get(session.problemId)?.avg ?? null,
    }));

  // Recent study sessions grouped by day for the weekly/history boards. The
  // weekly view only shows title + score, so full note text (the payload hog)
  // ships to /history alone; the today view doesn't render this at all.
  const weekHistoryMap = new Map<
    string,
    { problemId: string; frontendId: number; titleCn: string; difficulty: string; kind: string; feelingScore: number | null; noteMarkdown: string; noteSyntax: string; completedAt: string }[]
  >();
  if (wantWeekly || wantHistory) {
    for (const session of recentSessions) {
      const key = toDateKey(session.completedAt);
      const list = weekHistoryMap.get(key) ?? [];
      list.push({
        problemId: session.problemId,
        frontendId: session.problem.frontendId,
        titleCn: session.problem.titleCn,
        difficulty: session.problem.difficulty,
        kind: session.kind,
        feelingScore: session.feelingScore,
        noteMarkdown: wantHistory ? session.noteMarkdown : "",
        noteSyntax: wantHistory ? session.noteSyntax : "",
        completedAt: session.completedAt.toISOString(),
      });
      weekHistoryMap.set(key, list);
    }
  }
  const weekHistory = [...weekHistoryMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, items]) => ({ date, items }));
  // (problemId|dateKey) pairs that have a study session — used so a weekly plan
  // item counts as done if it was actually studied on that day (survives re-plan).
  const sessionDayKeys = new Set(
    recentSessions.map((session) => `${session.problemId}|${toDateKey(session.completedAt)}`),
  );

  // Progress counts only NEW problems (reviews are scheduled by due date and
  // aren't part of the "finish the plan in a month" target). Done = the
  // plan-item flag (survives a re-plan) OR a study session that day.
  function countNewProgress(plans: typeof weekProgressPlans) {
    let done = 0;
    let target = 0;
    for (const plan of plans) {
      const dateKey = toDateKey(plan.date);
      for (const item of plan.items) {
        if (item.kind !== "NEW") continue;
        target += 1;
        if (item.isCompleted || sessionDayKeys.has(`${item.problemId}|${dateKey}`)) {
          done += 1;
        }
      }
    }
    return { done, target };
  }
  const weekNew = countNewProgress(weekProgressPlans);
  const monthNew = countNewProgress(monthPlans);
  // "累计完成" = problems whose average feedback score is below 3 — i.e. well
  // understood (0 = one-shot AC, 5 = no idea).
  const masteredCount = feelingStats.filter(
    (stat) => stat._avg.feelingScore !== null && (stat._avg.feelingScore as number) < 3,
  ).length;

  // Contribution-style heatmap: per-day study-session counts over the last
  // HEAT_WEEKS calendar weeks (Monday-anchored, so each column is one week).
  const heatCounts: Record<string, number> = {};
  for (const session of heatSessions) {
    const key = toDateKey(session.completedAt);
    heatCounts[key] = (heatCounts[key] ?? 0) + 1;
  }
  const todayKeyForHeat = toDateKey(today);

  const availability = weekDays.map((date) => {
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
          items: todayPlan.items.map((item) => {
            // Done today = this plan item is marked done, OR there is a session
            // for this problem completed today (survives a re-plan). The editor
            // prefills with that session; if there's none, a fresh attempt is blank.
            const session = item.session ?? todaySessionByProblem.get(item.problemId) ?? null;
            return {
            id: item.id,
            kind: item.kind,
            estimatedMinutes: item.estimatedMinutes,
            isCompleted: item.isCompleted || Boolean(todaySessionByProblem.get(item.problemId)),
            carriedFromDate: item.carriedFromDate ? toDateKey(item.carriedFromDate) : null,
            session: session
              ? {
                  feelingScore: session.feelingScore,
                  reviewAfterDays: session.reviewAfterDays,
                  noteMarkdown: session.noteMarkdown,
                  noteSyntax: session.noteSyntax,
                }
              : null,
            // Past notes for this problem (excluding the entry being edited),
            // shown read-only below the editor for reference.
            history: (sessionsByProblem.get(item.problemId) ?? [])
              .filter((entry) => entry.id !== session?.id)
              .map((entry) => ({
                completedAt: entry.completedAt.toISOString(),
                feelingScore: entry.feelingScore,
                noteMarkdown: entry.noteMarkdown,
                noteSyntax: entry.noteSyntax,
              })),
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
              avgFeelingScore: feelingStatMap.get(item.problem.id)?.avg ?? null,
              feelingSessionCount: feelingStatMap.get(item.problem.id)?.count ?? 0,
            },
            };
          }),
        }
      : null,
    weekPlans: weekDailyPlans.map((plan) => ({
      date: toDateKey(plan.date),
      totalEstimatedMinutes: plan.totalEstimatedMinutes,
      items: plan.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        estimatedMinutes: item.estimatedMinutes,
        isCompleted: item.isCompleted || sessionDayKeys.has(`${item.problemId}|${toDateKey(plan.date)}`),
        carriedFromDate: item.carriedFromDate ? toDateKey(item.carriedFromDate) : null,
        problem: {
          id: item.problem.id,
          frontendId: item.problem.frontendId,
          titleCn: item.problem.titleCn,
          difficulty: item.problem.difficulty,
          leetcodeCnUrl: item.problem.leetcodeCnUrl,
        },
      })),
    })),
    weekHistory,
    todayExtra,
    planSettings,
    acmNotes,
    metrics: {
      weekNew,
      monthNew,
      mastered: masteredCount,
    },
    heatmap: {
      start: toDateKey(heatStart),
      weeks: HEAT_WEEKS,
      today: todayKeyForHeat,
      counts: heatCounts,
    },
    availability,
    slots,
    // The weekly view only uses the problem list for its search box (id/#/title/
    // difficulty/isEnabled), so the rest ships as cheap defaults there.
    problems: problems.map((problem) => ({
      id: problem.id,
      frontendId: problem.frontendId,
      titleCn: problem.titleCn,
      slug: wantWeekly ? "" : problem.slug,
      difficulty: problem.difficulty,
      tags: wantWeekly ? "" : problem.tags,
      isEnabled: problem.isEnabled,
      isAccepted: wantWeekly ? false : problem.progress?.isAccepted ?? false,
      mastery: wantWeekly ? null : problem.progress?.mastery ?? null,
      nextReviewDate:
        !wantWeekly && problem.reviewSchedule?.nextReviewDate
          ? toDateKey(problem.reviewSchedule.nextReviewDate)
          : null,
      lastAcceptedAt: wantWeekly ? null : problem.progress?.lastAcceptedAt?.toISOString() ?? null,
      lastSubmittedAt: wantWeekly ? null : problem.progress?.lastSubmittedAt?.toISOString() ?? null,
      totalSubmissions: wantWeekly ? 0 : problem.progress?.totalSubmissions ?? 0,
      acceptedSubmissions: wantWeekly ? 0 : problem.progress?.acceptedSubmissions ?? 0,
      acceptedRate: wantWeekly ? 0 : problem.progress?.acceptedRate ?? 0,
      reviewRiskScore: wantWeekly ? 0 : problem.progress?.reviewRiskScore ?? 0,
      noteCount: wantWeekly ? 0 : noteCountMap.get(problem.id) ?? 0,
      codeCount: wantWeekly ? 0 : codeCountMap.get(problem.id) ?? 0,
      avgFeelingScore: wantWeekly ? null : feelingStatMap.get(problem.id)?.avg ?? null,
      feelingSessionCount: wantWeekly ? 0 : feelingStatMap.get(problem.id)?.count ?? 0,
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
