import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
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
