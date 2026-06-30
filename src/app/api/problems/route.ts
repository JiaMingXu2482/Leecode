import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { startOfUtcDay } from "@/lib/dates";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const problems = await getDb().problem.findMany({
    orderBy: { hot100Order: "asc" },
    include: {
      progress: true,
      reviewSchedule: true,
    },
  });

  return NextResponse.json({ problems });
}

// Bulk include/exclude problems from the practice list (e.g. a whole topic).
export async function PATCH(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    problemIds?: string[];
    isEnabled?: boolean;
  };

  if (!Array.isArray(body.problemIds) || typeof body.isEnabled !== "boolean") {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  const db = getDb();
  await db.problem.updateMany({
    where: { id: { in: body.problemIds } },
    data: { isEnabled: body.isEnabled },
  });

  // Excluding a problem drops its review schedule and removes it from today's
  // and upcoming daily plans so it disappears from the plan right away.
  if (body.isEnabled === false) {
    await db.reviewSchedule.deleteMany({ where: { problemId: { in: body.problemIds } } });
    await db.planItem.deleteMany({
      where: {
        problemId: { in: body.problemIds },
        dailyPlan: { date: { gte: startOfUtcDay(new Date()) } },
      },
    });
  }

  return NextResponse.json({ ok: true, count: body.problemIds.length });
}
