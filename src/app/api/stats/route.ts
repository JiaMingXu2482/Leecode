import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = getDb();
  const today = startOfUtcDay(new Date());
  const [total, accepted, dueReviews, completedSessions, syncState] = await Promise.all([
    db.problem.count({ where: { isEnabled: true } }),
    db.problemProgress.count({ where: { isAccepted: true } }),
    db.reviewSchedule.count({ where: { nextReviewDate: { lte: today } } }),
    db.studySession.count(),
    db.leetCodeSyncState.findUnique({ where: { id: "leetcode-cn" } }),
  ]);

  const byTagRows = await db.problem.findMany({
    where: { isEnabled: true },
    include: { progress: true },
  });
  const byTag = new Map<string, { tag: string; total: number; accepted: number }>();

  for (const problem of byTagRows) {
    for (const tag of problem.tags.split(",").slice(0, 3)) {
      const current = byTag.get(tag) ?? { tag, total: 0, accepted: 0 };
      current.total += 1;
      current.accepted += problem.progress?.isAccepted ? 1 : 0;
      byTag.set(tag, current);
    }
  }

  return NextResponse.json({
    total,
    accepted,
    dueReviews,
    completedSessions,
    syncState,
    byTag: [...byTag.values()].sort((a, b) => b.total - a.total).slice(0, 10),
  });
}
