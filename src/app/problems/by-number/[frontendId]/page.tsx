import { notFound, redirect } from "next/navigation";
import { isAuthorizedServer } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// 按题号跳转到题目详情页。算法总结里的题号链接（#53 / HJ14 / P2352）指向这里 ——
// Markdown 渲染器是纯函数，拿不到数据库里的 cuid，只能按题号走这一跳。
export default async function ProblemByNumberPage({
  params,
}: {
  params: Promise<{ frontendId: string }>;
}) {
  if (!(await isAuthorizedServer())) {
    redirect("/login");
  }

  const { frontendId } = await params;
  const id = Number(frontendId);
  if (!Number.isInteger(id)) {
    notFound();
  }

  const problem = await getDb().problem.findUnique({
    where: { frontendId: id },
    select: { id: true },
  });
  if (!problem) {
    notFound();
  }

  redirect(`/problems/${problem.id}`);
}
