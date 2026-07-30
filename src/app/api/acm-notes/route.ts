import { NextRequest, NextResponse } from "next/server";
import {
  ACM_NOTE_CONTENT_LIMIT,
  ACM_NOTE_TITLE_LIMIT,
  ensureAcmNotesSeeded,
  isAcmNoteCategory,
  loadAcmNotes,
} from "@/lib/acm-notes";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  await ensureAcmNotesSeeded();
  return NextResponse.json({ notes: await loadAcmNotes() });
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    category?: unknown;
    content?: unknown;
    isPinned?: unknown;
  };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > ACM_NOTE_TITLE_LIMIT) {
    return NextResponse.json(
      { error: `标题必须是 1-${ACM_NOTE_TITLE_LIMIT} 字` },
      { status: 400 },
    );
  }
  if (!isAcmNoteCategory(body.category)) {
    return NextResponse.json({ error: "分类无效" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content : "";
  if (content.length > ACM_NOTE_CONTENT_LIMIT) {
    return NextResponse.json({ error: "正文太长了" }, { status: 400 });
  }

  const db = getDb();
  // New notes go to the top of their pin group.
  const min = await db.acmNote.aggregate({ _min: { sortOrder: true } });
  const note = await db.acmNote.create({
    data: {
      title,
      category: body.category,
      content,
      isPinned: body.isPinned === true,
      sortOrder: (min._min.sortOrder ?? 0) - 1,
    },
  });
  return NextResponse.json({ id: note.id, notes: await loadAcmNotes() });
}
