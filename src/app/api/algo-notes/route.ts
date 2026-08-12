import { NextRequest, NextResponse } from "next/server";
import { createAlgoNote, listAlgoNotes } from "@/lib/algo-notes";
import { isAuthorizedRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ notes: await listAlgoNotes() });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const note = await createAlgoNote(body);
  return NextResponse.json({ id: note.id, notes: await listAlgoNotes() });
}
