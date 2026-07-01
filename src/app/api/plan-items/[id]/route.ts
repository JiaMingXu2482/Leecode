import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { addUtcDays, startOfUtcDay, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";
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
  ]);

  // 陌生 (score 5): make sure this problem comes back the next day. The week is
  // planned ahead, so a fresh "unfamiliar" rating won't otherwise land in an
  // already-generated tomorrow — insert it into that day's plan directly.
  if (feelingScore === 5) {
    const todayStart = startOfUtcDay(new Date());
    let target = startOfUtcDay(review.nextReviewDate);
    if (weekdayIndex(target) === 0) {
      target = addUtcDays(target, 1); // Sunday is a rest day
    }
    if (target.getTime() >= todayStart.getTime()) {
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
      data: { totalEstimatedMinutes: { decrement: item.estimatedMinutes } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
