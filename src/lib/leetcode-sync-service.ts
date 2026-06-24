import { getDb } from "@/lib/db";
import { startOfUtcDay } from "@/lib/dates";
import { syncLeetCodeCnProblems } from "@/lib/leetcode-cn-sync";
import {
  createInitialReviewSchedules,
  type AcceptedProblemForScheduling,
} from "@/lib/review-scheduler";
import { calculateReviewRiskScore } from "@/lib/risk";

export class LeetCodeSyncInputError extends Error {
  status = 400;
}

export async function runLeetCodeCnSync({
  cookieOverride,
  persistCookie = true,
  syncCode = true,
}: {
  cookieOverride?: string;
  persistCookie?: boolean;
  syncCode?: boolean;
}) {
  const db = getDb();
  const previous = await db.leetCodeSyncState.upsert({
    where: { id: "leetcode-cn" },
    update: {},
    create: { id: "leetcode-cn" },
  });
  const cookie = cookieOverride?.trim() || previous.cookie;

  if (!cookie) {
    throw new LeetCodeSyncInputError("请先填写 leetcode.cn Cookie");
  }

  await db.leetCodeSyncState.update({
    where: { id: "leetcode-cn" },
    data: {
      cookie: persistCookie ? cookie : previous.cookie,
      status: "RUNNING",
      lastError: "",
      lastCodeSyncError: syncCode ? "" : previous.lastCodeSyncError,
    },
  });

  try {
    const problems = await db.problem.findMany({
      where: { isEnabled: true },
      orderBy: { hot100Order: "asc" },
    });
    const statuses = await syncLeetCodeCnProblems({ cookie, problems, syncCode });

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

      for (const submission of status.submissions) {
        await db.leetCodeSubmission.upsert({
          where: { submissionId: submission.submissionId },
          update: {
            problemId: status.problemId,
            language: submission.language,
            statusDisplay: submission.statusDisplay,
            isAccepted: submission.isAccepted,
            submittedAt: submission.submittedAt,
            code: submission.code,
            syncedAt: new Date(),
          },
          create: {
            problemId: status.problemId,
            submissionId: submission.submissionId,
            language: submission.language,
            statusDisplay: submission.statusDisplay,
            isAccepted: submission.isAccepted,
            submittedAt: submission.submittedAt,
            code: submission.code,
          },
        });
      }
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
    const codeErrors = statuses
      .map((status) => status.codeSyncError)
      .filter(Boolean)
      .join("; ");
    const state = await db.leetCodeSyncState.update({
      where: { id: "leetcode-cn" },
      data: {
        cookie: persistCookie ? cookie : previous.cookie,
        status: "SUCCESS",
        lastSyncedAt: new Date(),
        lastError: "",
        lastCodeSyncedAt: syncCode ? new Date() : previous.lastCodeSyncedAt,
        lastCodeSyncError: syncCode ? codeErrors : previous.lastCodeSyncError,
        acceptedCount,
        checkedCount: statuses.length,
      },
    });

    return { ok: true, acceptedCount, checkedCount: statuses.length, state, codeErrors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    await db.leetCodeSyncState.update({
      where: { id: "leetcode-cn" },
      data: { status: "FAILED", lastError: message },
    });

    throw error;
  }
}
