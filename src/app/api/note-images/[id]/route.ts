import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const image = await getDb().noteImage.findUnique({ where: { id } });
  if (!image) {
    return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(image.data), {
    headers: {
      "content-type": image.mimeType,
      "content-length": String(image.size),
      // 内容按 id 寻址，永不变化，可以长期缓存。private 是因为要带登录 cookie。
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
