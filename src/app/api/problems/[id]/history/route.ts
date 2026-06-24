import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
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
    select: { id: true },
  });

  if (!problem) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  const [sessions, submissions] = await Promise.all([
    getDb().studySession.findMany({
      where: { problemId: id },
      orderBy: { completedAt: "desc" },
      take: 50,
    }),
    getDb().leetCodeSubmission.findMany({
      where: { problemId: id },
      orderBy: { submittedAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({ sessions, submissions });
}
