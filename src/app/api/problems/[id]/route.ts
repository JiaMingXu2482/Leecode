import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const problem = await getDb().problem.findUnique({
    where: { id },
    include: {
      progress: true,
      reviewSchedule: true,
      sessions: { orderBy: { completedAt: "desc" }, take: 20 },
      leetcodeSubmissions: { orderBy: { submittedAt: "desc" }, take: 20 },
    },
  });

  if (!problem) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  return NextResponse.json({ problem });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    isEnabled?: boolean;
    tags?: string;
    estimatedNewMinutes?: number;
    estimatedReviewMinutes?: number;
  };

  const db = getDb();
  const problem = await db.problem.update({
    where: { id },
    data: {
      isEnabled: body.isEnabled,
      tags: body.tags,
      estimatedNewMinutes: body.estimatedNewMinutes,
      estimatedReviewMinutes: body.estimatedReviewMinutes,
    },
  });

  // Excluding a problem drops its review schedule and removes it from today's
  // and upcoming daily plans so it disappears right away. Study history is kept.
  if (body.isEnabled === false) {
    await db.reviewSchedule.deleteMany({ where: { problemId: id } });
    await db.planItem.deleteMany({
      where: { problemId: id, dailyPlan: { date: { gte: startOfUtcDay(new Date()) } } },
    });
  }

  return NextResponse.json({ problem });
}
