import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

// 笔记里粘贴的图片上传。存进 SQLite（和笔记同一个 volume，备份一起走），
// 正文里引用成 ![](/api/note-images/<id>)。

export const dynamic = "force-dynamic";

// 截图一般 100KB~1MB；给到 8MB 足够，同时挡住误拖进来的大文件。
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const mimeType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED.has(mimeType)) {
    return NextResponse.json(
      { error: `不支持的图片格式: ${mimeType || "(未知)"}；支持 PNG / JPEG / GIF / WebP / AVIF` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length) {
    return NextResponse.json({ error: "图片是空的" }, { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json(
      { error: `图片 ${(buffer.length / 1024 / 1024).toFixed(1)}MB，超过 8MB 上限` },
      { status: 413 },
    );
  }

  const image = await getDb().noteImage.create({
    data: { mimeType, size: buffer.length, data: buffer },
    select: { id: true },
  });
  return NextResponse.json({ id: image.id, url: `/api/note-images/${image.id}` });
}
