import { PlanItemKind } from "@prisma/client";
import { addUtcDays, fromDateKey, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { orderDailyNewPicks } from "@/lib/new-problem-picker";
import { calculateReviewRiskScore } from "@/lib/risk";
import { getPlanSettings } from "@/lib/settings";
import { topicForFrontendId, TOPIC_GROUPS } from "@/lib/topics";
import {
  deletePlanItemsRestoringMinutes,
  loadWeekPlans,
  NEW_POOL_WHERE,
  topUpNewProblems,
} from "@/lib/week-plans";

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
    include: {
      items: {
        where: { isCompleted: true },
        select: { problemId: true, estimatedMinutes: true, kind: true, carriedFromDate: true },
      },
    },
  });
  const keptByDate = new Map<string, { problemId: string; estimatedMinutes: number }[]>();
  // A finished new problem still counts against that day's new-problem quota, so
  // regeneration tops each day up to the quota instead of stacking a full fresh
  // quota on top of the completed ones (which is how days ballooned past N).
  // Carried-over debt is the exception: it stacks on top of the quota by design,
  // so a completed carried item doesn't consume one of the day's own slots.
  const completedNewByDate = new Map<string, number>();
  const assigned = new Set<string>();
  for (const plan of existingPlans) {
    const key = toDateKey(plan.date);
    keptByDate.set(key, plan.items);
    completedNewByDate.set(
      key,
      plan.items.filter((item) => item.kind === "NEW" && !item.carriedFromDate).length,
    );
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
    const key = toDateKey(date);
    const remainingQuota = Math.max(0, settings.newPerDay - (completedNewByDate.get(key) ?? 0));
    const picks = orderDailyNewPicks(
      pool.filter((problem) => !assigned.has(problem.id)),
      settings.priorityCategories,
      remainingQuota,
    );
    for (const problem of picks) {
      assigned.add(problem.id);
    }
    newByDate.set(
      key,
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

    if (fresh.length) {
      await db.planItem.createMany({
        data: fresh.map((item, index) => ({
          dailyPlanId: dailyPlan.id,
          problemId: item.problemId,
          kind: planKind(item.kind),
          estimatedMinutes: item.estimatedMinutes,
          sortOrder: kept.length + 1 + index,
        })),
      });
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
  if (!problem.isEnabled) {
    return { ok: false, message: `#${frontendId} ${problem.titleCn} 已被设为不刷，先恢复它才能排进计划` };
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

// Remove a problem from today's and upcoming plans (completed items are kept).
export async function removeProblemFromPlan(frontendId: number) {
  const db = getDb();
  const problem = await db.problem.findUnique({ where: { frontendId } });
  if (!problem) {
    return { ok: false, message: `找不到题号 #${frontendId}` };
  }
  const today = startOfUtcDay(new Date());
  const removed = await deletePlanItemsRestoringMinutes({
    problemId: problem.id,
    isCompleted: false,
    dailyPlan: { date: { gte: today } },
  });
  return removed
    ? { ok: true, message: `已把 #${frontendId} ${problem.titleCn} 从今后的计划里移除` }
    : { ok: true, message: `#${frontendId} ${problem.titleCn} 本来就不在今后的计划里` };
}

// Move a problem to a specific day: drop its unfinished upcoming occurrences,
// then add it to the target day.
export async function moveProblemToDate(frontendId: number, dateKey: string) {
  const db = getDb();
  const problem = await db.problem.findUnique({ where: { frontendId } });
  if (!problem) {
    return { ok: false, message: `找不到题号 #${frontendId}` };
  }
  const date = fromDateKey(dateKey);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, message: `日期无效: ${dateKey}` };
  }
  const today = startOfUtcDay(new Date());
  await deletePlanItemsRestoringMinutes({
    problemId: problem.id,
    isCompleted: false,
    dailyPlan: { date: { gte: today } },
  });
  const result = await addProblemToDate(frontendId, dateKey);
  return result.ok
    ? { ok: true, message: `已把 #${frontendId} ${problem.titleCn} 移到 ${dateKey}` }
    : result;
}

// Set a problem's next review date to N days from today (schedule created if
// the problem has never been rated). Adjusting how soon a problem comes back.
export async function setProblemReviewDays(frontendId: number, days: number) {
  const db = getDb();
  const problem = await db.problem.findUnique({
    where: { frontendId },
    include: { reviewSchedule: true },
  });
  if (!problem) {
    return { ok: false, message: `找不到题号 #${frontendId}` };
  }
  const d = Math.max(1, Math.min(90, Math.floor(days)));
  const next = addUtcDays(startOfUtcDay(new Date()), d);
  await db.reviewSchedule.upsert({
    where: { problemId: problem.id },
    update: { nextReviewDate: next },
    create: {
      problemId: problem.id,
      nextReviewDate: next,
      stage: problem.reviewSchedule?.stage ?? 1,
      consecutiveStrong: 0,
    },
  });
  return { ok: true, message: `#${frontendId} ${problem.titleCn} 将在 ${toDateKey(next)}（${d} 天后）复习` };
}

// Exclude / restore a whole Hot100 category (不刷). Excluding also drops its
// review schedules and upcoming plan items, then tops the week back up.
export async function setCategoryEnabled(name: string, enabled: boolean) {
  const db = getDb();
  const group = TOPIC_GROUPS.find((item) => item.name === name);
  if (!group) {
    return { ok: false, message: `未知分类: ${name}（可选: ${TOPIC_GROUPS.map((g) => g.name).join("、")}）` };
  }
  await db.problem.updateMany({
    where: { frontendId: { in: group.ids } },
    data: { isEnabled: enabled },
  });
  if (!enabled) {
    const today = startOfUtcDay(new Date());
    const problems = await db.problem.findMany({
      where: { frontendId: { in: group.ids } },
      select: { id: true },
    });
    const ids = problems.map((problem) => problem.id);
    await db.reviewSchedule.deleteMany({ where: { problemId: { in: ids } } });
    await deletePlanItemsRestoringMinutes({
      problemId: { in: ids },
      isCompleted: false,
      dailyPlan: { date: { gte: today } },
    });
    await topUpNewProblems(today);
  }
  return { ok: true, message: `已${enabled ? "恢复" : "设为不刷"}分类「${name}」` };
}

// Weak problems for recommendations: studied problems whose average feedback
// score is high (2 = shaky, 3+ = weak; 5 = no idea), worst first, with the
// per-category weak count so the assistant can suggest what to focus on.
export async function getWeakProblems() {
  const db = getDb();
  const stats = await db.studySession.groupBy({
    by: ["problemId"],
    where: { feelingScore: { not: null } },
    _avg: { feelingScore: true },
    _count: { _all: true },
  });
  const statById = new Map(stats.map((stat) => [stat.problemId, stat]));
  const problems = await db.problem.findMany({
    where: { id: { in: stats.map((stat) => stat.problemId) }, isEnabled: true },
    select: { id: true, frontendId: true, titleCn: true },
  });
  const rows = problems
    .map((problem) => ({
      frontendId: problem.frontendId,
      titleCn: problem.titleCn,
      category: topicForFrontendId(problem.frontendId),
      avg: statById.get(problem.id)?._avg.feelingScore ?? 0,
      count: statById.get(problem.id)?._count._all ?? 0,
    }))
    .filter((row) => row.avg >= 2)
    .sort((a, b) => b.avg - a.avg);

  const byCategory = new Map<string, number>();
  for (const row of rows) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
  }
  return {
    problems: rows.slice(0, 25),
    weakByCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
  };
}
