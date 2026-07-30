import { NextRequest, NextResponse } from "next/server";
import {
  ACM_NOTE_CONTENT_LIMIT,
  ACM_NOTE_TITLE_LIMIT,
  isAcmNoteCategory,
  loadAcmNotes,
} from "@/lib/acm-notes";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    category?: unknown;
    content?: unknown;
    isPinned?: unknown;
  };

  const data: { title?: string; category?: string; content?: string; isPinned?: boolean } = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title || title.length > ACM_NOTE_TITLE_LIMIT) {
      return NextResponse.json(
        { error: `标题必须是 1-${ACM_NOTE_TITLE_LIMIT} 字` },
        { status: 400 },
      );
    }
    data.title = title;
  }
  if (body.category !== undefined) {
    if (!isAcmNoteCategory(body.category)) {
      return NextResponse.json({ error: "分类无效" }, { status: 400 });
    }
    data.category = body.category;
  }
  if (body.content !== undefined) {
    if (typeof body.content !== "string" || body.content.length > ACM_NOTE_CONTENT_LIMIT) {
      return NextResponse.json({ error: "正文无效或太长" }, { status: 400 });
    }
    data.content = body.content;
  }
  if (body.isPinned !== undefined) {
    data.isPinned = body.isPinned === true;
  }

  const db = getDb();
  const exists = await db.acmNote.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }
  await db.acmNote.update({ where: { id }, data });
  return NextResponse.json({ notes: await loadAcmNotes() });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const db = getDb();
  // deleteMany so a stale id is a no-op instead of a 500.
  await db.acmNote.deleteMany({ where: { id } });
  return NextResponse.json({ notes: await loadAcmNotes() });
}
