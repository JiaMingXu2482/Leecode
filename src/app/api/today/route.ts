import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { startOfUtcDay, toDateKey } from "@/lib/dates";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const today = startOfUtcDay(new Date());
  const db = getDb();
  const plan = await db.dailyPlan.findUnique({
    where: { date: today },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          problem: { include: { progress: true, reviewSchedule: true } },
        },
      },
    },
  });

  return NextResponse.json({ date: toDateKey(today), plan });
}
