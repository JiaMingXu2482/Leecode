import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { fromDateKey, minutesBetween, weekdayIndex } from "@/lib/dates";
import { getDb } from "@/lib/db";

type SlotPayload = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

function normalizeSlot(slot: SlotPayload) {
  const date = fromDateKey(slot.date);
  const availableMinutes = slot.isAvailable
    ? minutesBetween(slot.startTime, slot.endTime)
    : 0;

  return {
    id: slot.id,
    date,
    weekday: weekdayIndex(date),
    startTime: slot.startTime,
    endTime: slot.endTime,
    isAvailable: slot.isAvailable,
    availableMinutes,
  };
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    slots?: SlotPayload[];
    availability?: { date: string; availableMinutes: number; isAvailable: boolean }[];
  };
  const db = getDb();

  if (Array.isArray(body.slots)) {
    for (const slot of body.slots.map(normalizeSlot)) {
      if (slot.id) {
        await db.availabilitySlot.upsert({
          where: { id: slot.id },
          update: slot,
          create: slot,
        });
      } else {
        await db.availabilitySlot.create({ data: slot });
      }
    }

    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.availability)) {
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

  return NextResponse.json({ error: "slots 必须是数组" }, { status: 400 });
}
