import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAuthorizedServer } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = { REVIEW: "复习", RETEST: "重测", NEW: "新题" };

export default async function ProblemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAuthorizedServer())) {
    redirect("/login");
  }

  const { id } = await params;
  const problem = await getDb().problem.findUnique({
    where: { id },
    include: {
      progress: true,
      reviewSchedule: true,
      sessions: { orderBy: { completedAt: "desc" }, take: 20 },
      leetcodeSubmissions: { orderBy: { submittedAt: "desc" }, take: 20 },
    },
  });

  if (!problem) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-canvas px-6 py-8 text-fg">
      <div className="mx-auto max-w-4xl">
        <Link href="/problems" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
          返回题库
        </Link>
        <div className="mt-6 rounded-lg border border-line p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-fg-subtle">#{problem.frontendId}</p>
              <h1 className="mt-1 text-2xl font-semibold">{problem.titleCn}</h1>
              <p className="mt-2 text-sm text-fg-subtle">{problem.tags}</p>
            </div>
            <a
              href={problem.leetcodeCnUrl}
              target="_blank"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
            >
              打开力扣
            </a>
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <Info label="同步状态" value={problem.progress?.isAccepted ? "已 AC" : "未通过/未同步"} />
            <Info label="掌握度" value={problem.progress?.mastery ?? "-"} />
            <Info
              label="下次复习"
              value={problem.reviewSchedule?.nextReviewDate.toISOString().slice(0, 10) ?? "-"}
            />
          </dl>
        </div>

        <section className="mt-5 rounded-lg border border-line p-5">
          <h2 className="text-sm font-semibold">轻量笔记</h2>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Info label="思路" value={problem.progress?.noteIdea || "-"} />
            <Info label="易错点" value={problem.progress?.notePitfall || "-"} />
            <Info label="复杂度" value={problem.progress?.noteComplexity || "-"} />
            <Info label="上次卡点" value={problem.progress?.noteLastBlocker || "-"} />
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-line p-5">
          <h2 className="text-sm font-semibold">做题历史与笔记</h2>
          <p className="mt-1 text-xs text-fg-subtle">每次做题的感觉评分、解题思路和 C++ 语法/知识点笔记，按时间倒序直接展示。</p>
          <div className="mt-4 space-y-3">
            {problem.sessions.length ? (
              problem.sessions.map((session) => (
                <div key={session.id} className="rounded-md border border-line p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">
                        {kindLabel[session.kind] ?? session.kind} / {session.rating}
                      </span>
                      {typeof session.feelingScore === "number" ? (
                        <span className="text-xs text-fg-subtle">做题感觉 {session.feelingScore}/5</span>
                      ) : null}
                    </div>
                    <span className="text-fg-subtle">
                      {session.spentMinutes}m · {session.completedAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  {session.noteMarkdown ? (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-fg-subtle">解题思路</div>
                      <div className="mt-1 rounded-md bg-muted p-3 leading-6 whitespace-pre-wrap text-fg">
                        {session.noteMarkdown}
                      </div>
                    </div>
                  ) : null}
                  {session.noteSyntax ? (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-fg-subtle">C++ 语法 / 知识点</div>
                      <div className="mt-1 rounded-md bg-muted p-3 leading-6 whitespace-pre-wrap text-fg">
                        {session.noteSyntax}
                      </div>
                    </div>
                  ) : null}
                  {!session.noteMarkdown && !session.noteSyntax ? (
                    <p className="mt-2 text-xs text-fg-subtle">这次没有写笔记。</p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-fg-subtle">还没有本地做题记录。</p>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-line p-5">
          <h2 className="text-sm font-semibold">代码记录</h2>
          <div className="mt-4 space-y-4">
            {problem.leetcodeSubmissions.length ? (
              problem.leetcodeSubmissions.map((submission) => (
                <details key={submission.id} className="rounded-md border border-line">
                  <summary className="cursor-pointer px-3 py-2 text-sm">
                    <span className="font-medium">{submission.statusDisplay}</span>
                    <span className="ml-2 text-fg-subtle">
                      {submission.language || "-"} · {submission.submittedAt.toISOString().slice(0, 19).replace("T", " ")}
                    </span>
                  </summary>
                  <pre className="max-h-[520px] overflow-auto border-t border-line bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                    <code>{submission.code || "这次同步只拿到了提交记录，没有拿到代码内容。"}</code>
                  </pre>
                </details>
              ))
            ) : (
              <p className="text-sm text-fg-subtle">还没有同步到代码。去力扣同步页重新同步一次。</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{value}</dd>
    </div>
  );
}
