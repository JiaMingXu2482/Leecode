import { NextRequest, NextResponse } from "next/server";
import { deleteAlgoNote, listAlgoNotes, updateAlgoNote } from "@/lib/algo-notes";
import { isAuthorizedRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await updateAlgoNote(id, body);
  } catch {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }
  return NextResponse.json({ notes: await listAlgoNotes() });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteAlgoNote(id);
  } catch {
    return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  }
  return NextResponse.json({ notes: await listAlgoNotes() });
}
