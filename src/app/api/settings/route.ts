import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getPlanSettings, sanitizeCategories, savePlanSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json(await getPlanSettings());
}

// Update plan settings (priority categories / per-day new-problem quota).
// Takes effect for future scheduling; hit 重排本周 to apply to this week.
export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    priorityCategories?: unknown;
    newPerDay?: unknown;
  };
  const update: { priorityCategories?: string[]; newPerDay?: number } = {};

  if (body.priorityCategories !== undefined) {
    const categories = sanitizeCategories(body.priorityCategories);
    if (categories === null) {
      return NextResponse.json({ error: "priorityCategories 无效" }, { status: 400 });
    }
    update.priorityCategories = categories;
  }
  if (body.newPerDay !== undefined) {
    if (typeof body.newPerDay !== "number" || body.newPerDay < 1 || body.newPerDay > 10) {
      return NextResponse.json({ error: "newPerDay 必须是 1-10 的数字" }, { status: 400 });
    }
    update.newPerDay = body.newPerDay;
  }

  await savePlanSettings(update);
  return NextResponse.json(await getPlanSettings());
}
