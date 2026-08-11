import { Difficulty, PlanItemKind } from "@prisma/client";
import { addUtcDays, fromDateKey, isoWeekday, startOfUtcDay, toDateKey, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { orderDailyNewPicks } from "@/lib/new-problem-picker";
import { orderTopicMatchedReviews } from "@/lib/review-picker";
import { calculateReviewRiskScore } from "@/lib/risk";
import { getPlanSettings } from "@/lib/settings";
import { topicForFrontendId, TOPIC_GROUPS } from "@/lib/topics";
import {
  deletePlanItemsRestoringMinutes,
  loadWeekPlans,
  MAX_REVIEWS_PER_DAY,
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

// Full re-plan of the current week (today → Sunday). Each non-rest day gets its
// quota of new problems first, then as many reviews as the day's time budget
// still fits. Which reviews depends on settings.reviewMode: CURVE keeps the
// forgetting curve, TOPIC matches Hot100 reviews to that day's new problems.
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
        select: {
          problemId: true,
          estimatedMinutes: true,
          kind: true,
          carriedFromDate: true,
          problem: { select: { frontendId: true, difficulty: true } },
        },
      },
    },
  });
  const keptByDate = new Map<
    string,
    {
      problemId: string;
      estimatedMinutes: number;
      kind: PlanItemKind;
      carriedFromDate: Date | null;
      problem: { frontendId: number; difficulty: Difficulty };
    }[]
  >();
  // A finished new problem still counts against that day's new-problem quota, so
  // regeneration tops each day up to the quota instead of stacking a full fresh
  // quota on top of the completed ones (which is how days ballooned past N).
  // Carried-over debt is the exception: it stacks on top of the quota by design,
  // so a completed carried item doesn't consume one of the day's own slots.
  const completedNewByDate = new Map<string, number>();
  // Completed reviews still occupy review capacity — a day the user already did
  // 6 reviews on shouldn't be refilled to the cap on top of them.
  const completedReviewsByDate = new Map<string, number>();
  const assigned = new Set<string>();
  for (const plan of existingPlans) {
    const key = toDateKey(plan.date);
    keptByDate.set(key, plan.items);
    completedNewByDate.set(
      key,
      plan.items.filter((item) => item.kind === "NEW" && !item.carriedFromDate).length,
    );
    completedReviewsByDate.set(key, plan.items.filter((item) => item.kind !== "NEW").length);
    for (const item of plan.items) {
      assigned.add(item.problemId);
    }
  }

  // 休息日完全不排题（用户设的，比如周日）。已完成的记录照常保留。
  const activeDates = windowDates.filter((date) => !settings.restWeekdays.includes(isoWeekday(date)));

  // 新题先排：当天新题的考点决定了当天配哪些 Hot100 复习题，所以顺序反过来了。
  // 新题池和复习池是不相交的（新题池要求 reviewSchedule 为 null），先占后占都行。
  const pool = await db.problem.findMany({
    where: NEW_POOL_WHERE,
    orderBy: { hot100Order: "asc" },
  });
  const newByDate = new Map<string, Candidate[]>();
  const topicsByDate = new Map<string, string[]>();
  for (const date of activeDates) {
    const key = toDateKey(date);
    const kept = keptByDate.get(key) ?? [];
    const keptNew = kept.filter((item) => item.kind === "NEW");
    const remainingQuota = Math.max(0, settings.newPerDay - (completedNewByDate.get(key) ?? 0));
    const picks = orderDailyNewPicks(
      pool.filter((problem) => !assigned.has(problem.id)),
      settings.priorityCategories,
      remainingQuota,
      // Completed problems stay on the day, so their categories are taken and
      // an already-done 简单 counts against the day's easy allowance.
      keptNew.map((item) => topicForFrontendId(item.problem.frontendId)),
      keptNew.filter((item) => item.problem.difficulty === "EASY").length,
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
    topicsByDate.set(key, [
      ...keptNew.map((item) => topicForFrontendId(item.problem.frontendId)),
      ...picks.map((problem) => topicForFrontendId(problem.frontendId)),
    ]);
  }

  // 每天的复习容量：时间预算扣掉已完成的和新题占的，剩下多少排多少复习
  // （再加一道条数上限兜底）。所以「每天几小时」这一个数就能控制复习量。
  const capacityByDate = new Map<string, { minutes: number; slots: number }>();
  for (const date of activeDates) {
    const key = toDateKey(date);
    const usedMinutes =
      (keptByDate.get(key) ?? []).reduce((sum, item) => sum + item.estimatedMinutes, 0) +
      (newByDate.get(key) ?? []).reduce((sum, item) => sum + item.estimatedMinutes, 0);
    capacityByDate.set(key, {
      minutes: Math.max(0, settings.dailyMinutes - usedMinutes),
      slots: Math.max(0, MAX_REVIEWS_PER_DAY - (completedReviewsByDate.get(key) ?? 0)),
    });
  }

  const schedules = await db.reviewSchedule.findMany({
    where: { problem: { isEnabled: true } },
    include: {
      problem: { select: { source: true, frontendId: true, estimatedReviewMinutes: true } },
    },
    orderBy: { nextReviewDate: "asc" },
  });
  // 平均反馈分 = 有多不熟（0 = AC 快 … 5 = 陌生），考点匹配时用来决定先复习哪道。
  const feelingStats = await db.studySession.groupBy({
    by: ["problemId"],
    where: { feelingScore: { not: null } },
    _avg: { feelingScore: true },
  });
  const avgFeelingByProblem = new Map(
    feelingStats.map((stat) => [stat.problemId, stat._avg.feelingScore]),
  );

  const reviewsByDate = new Map<string, Candidate[]>();
  type Schedule = (typeof schedules)[number];
  const placeReview = (key: string, schedule: Schedule) => {
    const capacity = capacityByDate.get(key);
    if (!capacity || capacity.slots <= 0 || capacity.minutes < schedule.problem.estimatedReviewMinutes) {
      return false;
    }
    capacity.slots -= 1;
    capacity.minutes -= schedule.problem.estimatedReviewMinutes;
    const list = reviewsByDate.get(key) ?? [];
    list.push({
      problemId: schedule.problemId,
      kind: schedule.stage === 0 ? "retest" : "review",
      estimatedMinutes: schedule.problem.estimatedReviewMinutes,
    });
    reviewsByDate.set(key, list);
    assigned.add(schedule.problemId);
    return true;
  };

  // 遗忘曲线派：到期的排到到期那天，过期的（或到期日撞上休息日/满了的）从最早
  // 一天开始找位置。most-overdue-first 由查询的 orderBy 保证。
  const fillByCurve = (candidates: Schedule[]) => {
    const spillover: Schedule[] = [];
    for (const schedule of candidates) {
      if (assigned.has(schedule.problemId)) {
        continue;
      }
      const dueKey = toDateKey(startOfUtcDay(schedule.nextReviewDate));
      if (dueKey > lastKey) {
        continue; // 下周才到期，留给下周
      }
      if (dueKey < firstKey || !placeReview(dueKey, schedule)) {
        spillover.push(schedule);
      }
    }
    for (const schedule of spillover) {
      for (const date of activeDates) {
        if (placeReview(toDateKey(date), schedule)) {
          break;
        }
      }
      // 本周实在装不下的继续挂着过期，后面几天自然会补上（涓流，不是雪崩）。
    }
  };

  // 牛客 / 速成题单的复习永远按遗忘曲线 —— 刚做过的 ACM 题就该按时回来。
  fillByCurve(schedules.filter((schedule) => schedule.problem.source !== "LEETCODE"));

  const leetcodeSchedules = schedules.filter((schedule) => schedule.problem.source === "LEETCODE");
  if (settings.reviewMode === "TOPIC") {
    // Hot100 改成考点匹配：挑和当天新题同一个知识点的题，新学的和复习的一起记。
    const scheduleById = new Map(leetcodeSchedules.map((schedule) => [schedule.problemId, schedule]));
    for (const date of activeDates) {
      const key = toDateKey(date);
      const capacity = capacityByDate.get(key);
      if (!capacity || capacity.slots <= 0) {
        continue;
      }
      const picks = orderTopicMatchedReviews(
        leetcodeSchedules
          .filter((schedule) => !assigned.has(schedule.problemId))
          .map((schedule) => ({
            problemId: schedule.problemId,
            frontendId: schedule.problem.frontendId,
            estimatedReviewMinutes: schedule.problem.estimatedReviewMinutes,
            nextReviewDate: schedule.nextReviewDate,
            avgFeelingScore: avgFeelingByProblem.get(schedule.problemId) ?? null,
          })),
        topicsByDate.get(key) ?? [],
        capacity.slots,
      );
      for (const pick of picks) {
        const schedule = scheduleById.get(pick.problemId);
        if (schedule) {
          placeReview(key, schedule);
        }
      }
    }
  } else {
    fillByCurve(leetcodeSchedules);
  }

  for (const date of windowDates) {
    const key = toDateKey(date);
    const kept = keptByDate.get(key) ?? [];
    const fresh = [...(reviewsByDate.get(key) ?? []), ...(newByDate.get(key) ?? [])];
    const keptMinutes = kept.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const totalMinutes = keptMinutes + fresh.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    // Marking today as auto-filled makes the regenerated result authoritative:
    // ensureTodayPlan won't pile carried debt on top of it afterward. Future
    // days stay unmarked so they still catch up debt when they arrive.
    const filledMark = date.getTime() === today.getTime() ? new Date() : undefined;
    const dailyPlan = await db.dailyPlan.upsert({
      where: { date },
      update: {
        availableMinutes: totalMinutes,
        totalEstimatedMinutes: totalMinutes,
        newFilledAt: filledMark,
        items: { deleteMany: { isCompleted: false } },
      },
      create: {
        date,
        availableMinutes: totalMinutes,
        totalEstimatedMinutes: totalMinutes,
        newFilledAt: filledMark,
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
