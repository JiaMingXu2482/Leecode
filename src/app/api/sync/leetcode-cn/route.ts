import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { startOfUtcDay } from "@/lib/dates";
import { syncLeetCodeCnProblems } from "@/lib/leetcode-cn-sync";
import {
  createInitialReviewSchedules,
  type AcceptedProblemForScheduling,
} from "@/lib/review-scheduler";
import { calculateReviewRiskScore } from "@/lib/risk";

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { cookie?: string };
  const db = getDb();
  const previous = await db.leetCodeSyncState.upsert({
    where: { id: "leetcode-cn" },
    update: {},
    create: { id: "leetcode-cn" },
  });
  const cookie = body.cookie?.trim() || previous.cookie;

  if (!cookie) {
    return NextResponse.json({ error: "请先填写 leetcode.cn Cookie" }, { status: 400 });
  }

  await db.leetCodeSyncState.update({
    where: { id: "leetcode-cn" },
    data: { cookie, status: "RUNNING", lastError: "" },
  });

  try {
    const problems = await db.problem.findMany({
      where: { isEnabled: true },
      orderBy: { hot100Order: "asc" },
    });
    const statuses = await syncLeetCodeCnProblems({ cookie, problems });

    for (const status of statuses) {
      const problem = problems.find((item) => item.id === status.problemId);
      await db.problemProgress.upsert({
        where: { problemId: status.problemId },
        update: {
          isAccepted: status.accepted,
          lastAcceptedAt: status.lastAcceptedAt,
          lastSubmittedAt: status.lastSubmittedAt,
          totalSubmissions: status.totalSubmissions,
          acceptedSubmissions: status.acceptedSubmissions,
          acceptedRate: status.acceptedRate,
          reviewRiskScore: problem
            ? calculateReviewRiskScore({
                acceptedRate: status.acceptedRate,
                totalSubmissions: status.totalSubmissions,
                lastAcceptedAt: status.lastAcceptedAt,
                difficulty: problem.difficulty,
              })
            : 0,
        },
        create: {
          problemId: status.problemId,
          isAccepted: status.accepted,
          lastAcceptedAt: status.lastAcceptedAt,
          lastSubmittedAt: status.lastSubmittedAt,
          totalSubmissions: status.totalSubmissions,
          acceptedSubmissions: status.acceptedSubmissions,
          acceptedRate: status.acceptedRate,
          reviewRiskScore: problem
            ? calculateReviewRiskScore({
                acceptedRate: status.acceptedRate,
                totalSubmissions: status.totalSubmissions,
                lastAcceptedAt: status.lastAcceptedAt,
                difficulty: problem.difficulty,
              })
            : 0,
        },
      });
    }

    const existingSchedules = await db.reviewSchedule.findMany({
      select: { problemId: true },
    });
    const scheduledIds = new Set(existingSchedules.map((item) => item.problemId));
    const acceptedForInitialSchedule = statuses
      .filter((status) => status.accepted && !scheduledIds.has(status.problemId))
      .map((status) => {
        const problem = problems.find((item) => item.id === status.problemId);

        return problem
          ? {
              problemId: status.problemId,
              difficulty: problem.difficulty,
              lastAcceptedAt: status.lastAcceptedAt,
            }
          : null;
      })
      .filter((item): item is AcceptedProblemForScheduling => Boolean(item));

    const schedules = createInitialReviewSchedules({
      today: startOfUtcDay(new Date()),
      problems: acceptedForInitialSchedule,
    });

    for (const schedule of schedules) {
      await db.reviewSchedule.upsert({
        where: { problemId: schedule.problemId },
        update: {},
        create: schedule,
      });
    }

    const acceptedCount = statuses.filter((status) => status.accepted).length;
    const state = await db.leetCodeSyncState.update({
      where: { id: "leetcode-cn" },
      data: {
        cookie,
        status: "SUCCESS",
        lastSyncedAt: new Date(),
        lastError: "",
        acceptedCount,
        checkedCount: statuses.length,
      },
    });

    return NextResponse.json({ ok: true, acceptedCount, checkedCount: statuses.length, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    await db.leetCodeSyncState.update({
      where: { id: "leetcode-cn" },
      data: { status: "FAILED", lastError: message },
    });

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
