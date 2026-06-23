import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { fromDateKey } from "@/lib/dates";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    availability?: { date: string; availableMinutes: number; isAvailable: boolean }[];
  };

  if (!Array.isArray(body.availability)) {
    return NextResponse.json({ error: "availability 必须是数组" }, { status: 400 });
  }

  const db = getDb();

  for (const slot of body.availability) {
    await db.availability.upsert({
      where: { date: fromDateKey(slot.date) },
      update: {
        availableMinutes: slot.isAvailable ? Math.max(0, slot.availableMinutes) : 0,
        isAvailable: slot.isAvailable,
      },
      create: {
        date: fromDateKey(slot.date),
        availableMinutes: slot.isAvailable ? Math.max(0, slot.availableMinutes) : 0,
        isAvailable: slot.isAvailable,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
