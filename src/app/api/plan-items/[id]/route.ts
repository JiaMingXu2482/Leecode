import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { normalizePassRate, resolvePassRate } from "@/lib/pass-rate";
import {
  calculateFeelingScoreReview,
  type FeelingScore,
} from "@/lib/review-scheduler";

function prismaRating(rating: string) {
  if (rating === "forgot") return "FORGOT";
  if (rating === "shaky") return "SHAKY";
  if (rating === "ok") return "OK";
  return "MASTERED";
}

function normalizeFeelingScore(value: unknown): FeelingScore | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5) {
    return null;
  }

  return value as FeelingScore;
}


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    completed?: boolean;
    feelingScore?: number;
    reviewAfterDays?: number;
    passRate?: number | null;
    noteMarkdown?: string;
    noteSyntax?: string;
  };
  const db = getDb();
  const item = await db.planItem.findUnique({
    where: { id },
    include: {
      problem: { include: { reviewSchedule: true } },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Plan item not found" }, { status: 404 });
  }

  const feelingScore = normalizeFeelingScore(body.feelingScore);

  if (typeof body.feelingScore !== "undefined" && feelingScore === null) {
    return NextResponse.json(
      { error: "feelingScore must be an integer from 0 to 5" },
      { status: 400 },
    );
  }

  if (typeof body.passRate !== "undefined" && !normalizePassRate(body.passRate).ok) {
    return NextResponse.json({ error: "通过率必须是 0-100 的数字" }, { status: 400 });
  }

  if (feelingScore === null) {
    const updated = await db.planItem.update({
      where: { id },
      data: { isCompleted: body.completed ?? true },
    });

    return NextResponse.json({ item: updated });
  }

  // Re-editing a completed task updates its existing session instead of
  // creating a new one, and keeps the original completion date stable.
  const existingSession = await db.studySession.findUnique({
    where: { planItemId: id },
  });
  const schedule = item.problem.reviewSchedule;
  const reviewedAt = existingSession?.completedAt ?? new Date();
  const review = calculateFeelingScoreReview({
    reviewedAt,
    score: feelingScore,
    reviewAfterDays: body.reviewAfterDays,
    currentStage: schedule?.stage ?? 0,
    consecutiveStrong: schedule?.consecutiveStrong ?? 0,
  });
  const rating = prismaRating(review.rating);
  const accepted = item.kind === "NEW" ? feelingScore < 5 : true;
  // On edit, don't advance the spaced-repetition stage again; only the
  // next review date, rating and notes change.
  const stage = existingSession ? schedule?.stage ?? review.stage : review.stage;
  const consecutiveStrong = existingSession
    ? schedule?.consecutiveStrong ?? review.consecutiveStrong
    : review.consecutiveStrong;
  const noteMarkdown = body.noteMarkdown ?? existingSession?.noteMarkdown ?? "";
  const noteSyntax = body.noteSyntax ?? existingSession?.noteSyntax ?? "";
  const resolved = resolvePassRate(body.passRate, existingSession?.passRate);
  const nextPassRate = resolved.ok ? resolved.value : null;
  // ACM 格式的题（牛客 / 速成题单）不进复习循环 —— 机考不考原题，做它们是为了
  // 积累经验、总结笔记、保持手感，重做一遍价值很低。只有 Hot100 需要按遗忘曲线
  // 复习。所以这里根本不给 ACM 题建复习计划，否则库里会堆一堆永远不会被排的
  // 到期记录，还把「过期待复习」的统计撑得很虚。
  const needsReviewCycle = item.problem.source === "LEETCODE";

  const [updated] = await db.$transaction([
    db.planItem.update({
      where: { id },
      data: { isCompleted: true },
    }),
    db.studySession.upsert({
      where: { planItemId: id },
      update: {
        kind: item.kind,
        rating,
        feelingScore,
        reviewAfterDays: review.reviewAfterDays,
        passRate: nextPassRate,
        noteMarkdown,
        noteSyntax,
      },
      create: {
        problemId: item.problemId,
        planItemId: id,
        kind: item.kind,
        rating,
        feelingScore,
        reviewAfterDays: review.reviewAfterDays,
        passRate: nextPassRate,
        spentMinutes: Math.max(1, item.estimatedMinutes),
        noteMarkdown,
        noteSyntax,
      },
    }),
    db.problemProgress.upsert({
      where: { problemId: item.problemId },
      update: {
        isAccepted: accepted,
        mastery: rating,
        lastAcceptedAt: accepted ? reviewedAt : undefined,
      },
      create: {
        problemId: item.problemId,
        isAccepted: accepted,
        mastery: rating,
        lastAcceptedAt: accepted ? reviewedAt : null,
      },
    }),
    ...(needsReviewCycle
      ? [
          db.reviewSchedule.upsert({
            where: { problemId: item.problemId },
            update: {
              nextReviewDate: review.nextReviewDate,
              stage,
              consecutiveStrong,
            },
            create: {
              problemId: item.problemId,
              nextReviewDate: review.nextReviewDate,
              stage,
              consecutiveStrong,
            },
          }),
        ]
      : []),
  ]);

  // Whenever a rated problem's next review falls within this week (today →
  // Sunday), drop it straight onto that day's plan so the weekly view reflects
  // it immediately — no re-plan needed. Reviews due after this week wait.
  // ACM 题不进复习循环，所以整段跳过。
  if (needsReviewCycle) {
    const todayStart = startOfUtcDay(new Date());
    const weekStart = addUtcDays(todayStart, -((weekdayIndex(todayStart) + 6) % 7));
    const weekEnd = addUtcDays(weekStart, 6); // Sunday
    const target = startOfUtcDay(review.nextReviewDate);
    if (target.getTime() >= todayStart.getTime() && target.getTime() <= weekEnd.getTime()) {
      const targetPlan = await db.dailyPlan.upsert({
        where: { date: target },
        update: {},
        create: { date: target, availableMinutes: 0, totalEstimatedMinutes: 0 },
      });
      const already = await db.planItem.findFirst({
        where: { dailyPlanId: targetPlan.id, problemId: item.problemId },
      });
      if (!already) {
        const estimatedMinutes = item.problem.estimatedReviewMinutes;
        const maxSort = await db.planItem.aggregate({
          where: { dailyPlanId: targetPlan.id },
          _max: { sortOrder: true },
        });
        await db.$transaction([
          db.planItem.create({
            data: {
              dailyPlanId: targetPlan.id,
              problemId: item.problemId,
              kind: "REVIEW",
              estimatedMinutes,
              sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
            },
          }),
          db.dailyPlan.update({
            where: { id: targetPlan.id },
            data: {
              totalEstimatedMinutes: { increment: estimatedMinutes },
              availableMinutes: { increment: estimatedMinutes },
            },
          }),
        ]);
      }
    }
  }

  return NextResponse.json({
    item: updated,
    nextReviewDate: review.nextReviewDate,
    reviewAfterDays: review.reviewAfterDays,
    rating,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  const item = await db.planItem.findUnique({ where: { id } });

  if (!item) {
    return NextResponse.json({ error: "Plan item not found" }, { status: 404 });
  }

  await db.$transaction([
    db.planItem.delete({ where: { id } }),
    db.dailyPlan.update({
      where: { id: item.dailyPlanId },
      data: {
        totalEstimatedMinutes: { decrement: item.estimatedMinutes },
        availableMinutes: { decrement: item.estimatedMinutes },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
