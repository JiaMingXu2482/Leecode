import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
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

  const reviewedAt = new Date();
  const review = calculateFeelingScoreReview({
    reviewedAt,
    score: feelingScore,
    reviewAfterDays: body.reviewAfterDays,
    currentStage: item.problem.reviewSchedule?.stage ?? 0,
    consecutiveStrong: item.problem.reviewSchedule?.consecutiveStrong ?? 0,
  });
  const rating = prismaRating(review.rating);
  const accepted = item.kind === "NEW" ? feelingScore < 5 : true;

  const [updated] = await db.$transaction([
    db.planItem.update({
      where: { id },
      data: { isCompleted: true },
    }),
    db.studySession.create({
      data: {
        problemId: item.problemId,
        kind: item.kind,
        rating,
        spentMinutes: Math.max(1, item.estimatedMinutes),
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
        stage: review.stage,
        consecutiveStrong: review.consecutiveStrong,
      },
      create: {
        problemId: item.problemId,
        nextReviewDate: review.nextReviewDate,
        stage: review.stage,
        consecutiveStrong: review.consecutiveStrong,
      },
    }),
  ]);

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
