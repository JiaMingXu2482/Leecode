import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ALL_CATEGORY_NAMES } from "@/lib/problem-sets";

// 改一道题的算法分类。题单里的分类偶尔归错（比如 BFS 的题被放进 DFS），
// 改动存进 categoryOverride，导入时不会被代码里的值覆盖；tags 同步成新值，
// 排题和界面分组读的都是 tags。
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { category?: string };
  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category || !ALL_CATEGORY_NAMES.has(category)) {
    return NextResponse.json({ error: "分类无效" }, { status: 400 });
  }

  const db = getDb();
  const problem = await db.problem.findUnique({ where: { id }, select: { id: true } });
  if (!problem) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  await db.problem.update({
    where: { id },
    data: { tags: category, categoryOverride: category },
  });

  return NextResponse.json({ ok: true, category });
}
