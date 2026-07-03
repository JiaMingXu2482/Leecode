import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

// Full data export: every problem's progress, every study session with notes,
// review schedules and synced code — downloadable as one JSON backup file.
export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const db = getDb();
  const [problems, sessions, schedules, submissions, plans] = await Promise.all([
    db.problem.findMany({ orderBy: { hot100Order: "asc" }, include: { progress: true } }),
    db.studySession.findMany({ orderBy: { completedAt: "asc" } }),
    db.reviewSchedule.findMany(),
    db.leetCodeSubmission.findMany({ orderBy: { submittedAt: "asc" } }),
    db.dailyPlan.findMany({ orderBy: { date: "asc" }, include: { items: true } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    counts: {
      problems: problems.length,
      sessions: sessions.length,
      schedules: schedules.length,
      submissions: submissions.length,
      plans: plans.length,
    },
    problems,
    sessions,
    schedules,
    submissions,
    plans,
  };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="hot100-backup-${date}.json"`,
    },
  });
}
