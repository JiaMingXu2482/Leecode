import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getPlanSettings, sanitizeCategories, savePlanSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json(await getPlanSettings());
}

// Update plan settings: priority categories, per-day new-problem quota, the
// daily time budget (which is what decides how many reviews fit), rest days and
// the review-selection mode. Takes effect for future scheduling; hit 重排本周
// to apply it to this week.
export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    priorityCategories?: unknown;
    newPerDay?: unknown;
    dailyMinutes?: unknown;
    restWeekdays?: unknown;
    reviewMode?: unknown;
  };
  const update: Parameters<typeof savePlanSettings>[0] = {};

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
  if (body.dailyMinutes !== undefined) {
    if (typeof body.dailyMinutes !== "number" || body.dailyMinutes < 30 || body.dailyMinutes > 720) {
      return NextResponse.json({ error: "dailyMinutes 必须是 30-720 的数字（分钟）" }, { status: 400 });
    }
    update.dailyMinutes = body.dailyMinutes;
  }
  if (body.restWeekdays !== undefined) {
    if (
      !Array.isArray(body.restWeekdays) ||
      body.restWeekdays.some((day) => typeof day !== "number" || day < 1 || day > 7)
    ) {
      return NextResponse.json({ error: "restWeekdays 必须是 1-7 的数字数组（1=周一，7=周日）" }, { status: 400 });
    }
    update.restWeekdays = body.restWeekdays as number[];
  }
  if (body.reviewMode !== undefined) {
    if (body.reviewMode !== "CURVE" && body.reviewMode !== "TOPIC") {
      return NextResponse.json({ error: "reviewMode 只能是 CURVE 或 TOPIC" }, { status: 400 });
    }
    update.reviewMode = body.reviewMode;
  }

  await savePlanSettings(update);
  return NextResponse.json(await getPlanSettings());
}
