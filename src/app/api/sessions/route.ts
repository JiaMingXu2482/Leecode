import { PlanItemKind, RecallRating } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { calculateNextReview } from "@/lib/review-scheduler";

const ratingMap: Record<string, RecallRating> = {
  forgot: "FORGOT",
  shaky: "SHAKY",
  ok: "OK",
  mastered: "MASTERED",
};

const kindMap: Record<string, PlanItemKind> = {
  review: "REVIEW",
  retest: "RETEST",
  new: "NEW",
};

function schedulerRating(rating: RecallRating) {
  if (rating === "FORGOT") return "forgot";
  if (rating === "SHAKY") return "shaky";
  if (rating === "OK") return "ok";
  return "mastered";
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    problemId?: string;
    planItemId?: string;
    kind?: string;
    rating?: string;
    spentMinutes?: number;
    noteIdea?: string;
    notePitfall?: string;
    noteComplexity?: string;
    noteCodeLink?: string;
    noteLastBlocker?: string;
    noteMarkdown?: string;
  };
  const rating = body.rating ? ratingMap[body.rating] : undefined;
  const kind = body.kind ? kindMap[body.kind] : undefined;

  if (!body.problemId || !rating || !kind) {
    return NextResponse.json({ error: "problemId、kind、rating 为必填" }, { status: 400 });
  }

  const db = getDb();
  const schedule = await db.reviewSchedule.findUnique({ where: { problemId: body.problemId } });
  const next = calculateNextReview({
    reviewedAt: new Date(),
    rating: schedulerRating(rating),
    currentStage: schedule?.stage ?? 0,
    consecutiveStrong: schedule?.consecutiveStrong ?? 0,
  });

  // One transaction: a crash between these writes must not leave a session
  // recorded without its schedule/progress advancing (or vice versa). The plan
  // item is completed via updateMany so a stale/bogus id is a no-op, not a 500
  // after everything else was already written.
  const [session] = await db.$transaction([
    db.studySession.create({
      data: {
        problemId: body.problemId,
        kind,
        rating,
        spentMinutes: Math.max(1, body.spentMinutes ?? 30),
        noteIdea: body.noteIdea ?? "",
        notePitfall: body.notePitfall ?? "",
        noteComplexity: body.noteComplexity ?? "",
        noteCodeLink: body.noteCodeLink ?? "",
        noteLastBlocker: body.noteLastBlocker ?? "",
        noteMarkdown: body.noteMarkdown ?? "",
      },
    }),
    db.problemProgress.upsert({
      where: { problemId: body.problemId },
      update: {
        isAccepted: rating !== "FORGOT",
        mastery: rating,
        lastAcceptedAt: rating !== "FORGOT" ? new Date() : undefined,
        noteIdea: body.noteIdea ?? "",
        notePitfall: body.notePitfall ?? "",
        noteComplexity: body.noteComplexity ?? "",
        noteCodeLink: body.noteCodeLink ?? "",
        noteLastBlocker: body.noteLastBlocker ?? "",
      },
      create: {
        problemId: body.problemId,
        isAccepted: rating !== "FORGOT",
        mastery: rating,
        lastAcceptedAt: rating !== "FORGOT" ? new Date() : null,
        noteIdea: body.noteIdea ?? "",
        notePitfall: body.notePitfall ?? "",
        noteComplexity: body.noteComplexity ?? "",
        noteCodeLink: body.noteCodeLink ?? "",
        noteLastBlocker: body.noteLastBlocker ?? "",
      },
    }),
    db.reviewSchedule.upsert({
      where: { problemId: body.problemId },
      update: {
        nextReviewDate: next.nextReviewDate,
        stage: next.stage,
        consecutiveStrong: next.consecutiveStrong,
      },
      create: {
        problemId: body.problemId,
        nextReviewDate: next.nextReviewDate,
        stage: next.stage,
        consecutiveStrong: next.consecutiveStrong,
      },
    }),
    ...(body.planItemId
      ? [
          db.planItem.updateMany({
            where: { id: body.planItemId },
            data: { isCompleted: true },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ session, nextReviewDate: next.nextReviewDate });
}
