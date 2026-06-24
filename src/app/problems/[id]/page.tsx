import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { isAuthorizedServer } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

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
    <main className="min-h-screen bg-white px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-4xl">
        <Link href="/problems" className="text-sm text-blue-600 hover:text-blue-700">
          返回题库
        </Link>
        <div className="mt-6 rounded-lg border border-slate-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-slate-400">#{problem.frontendId}</p>
              <h1 className="mt-1 text-2xl font-semibold">{problem.titleCn}</h1>
              <p className="mt-2 text-sm text-slate-500">{problem.tags}</p>
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

        <section className="mt-5 rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold">轻量笔记</h2>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Info label="思路" value={problem.progress?.noteIdea || "-"} />
            <Info label="易错点" value={problem.progress?.notePitfall || "-"} />
            <Info label="复杂度" value={problem.progress?.noteComplexity || "-"} />
            <Info label="上次卡点" value={problem.progress?.noteLastBlocker || "-"} />
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold">做题历史</h2>
          <div className="mt-4 space-y-3">
            {problem.sessions.length ? (
              problem.sessions.map((session) => (
                <div key={session.id} className="border-b border-slate-100 pb-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-3">
                    <span>{session.kind} / {session.rating}</span>
                    <span className="text-slate-500">
                      {session.spentMinutes}m · {session.completedAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  {session.noteMarkdown ? (
                    <div className="mt-3 rounded-md bg-slate-50 p-3 leading-6 whitespace-pre-wrap text-slate-700">
                      {session.noteMarkdown}
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">还没有本地做题记录。</p>
            )}
          </div>
        </section>

        <section className="mt-5 rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold">代码记录</h2>
          <div className="mt-4 space-y-4">
            {problem.leetcodeSubmissions.length ? (
              problem.leetcodeSubmissions.map((submission) => (
                <details key={submission.id} className="rounded-md border border-slate-200">
                  <summary className="cursor-pointer px-3 py-2 text-sm">
                    <span className="font-medium">{submission.statusDisplay}</span>
                    <span className="ml-2 text-slate-500">
                      {submission.language || "-"} · {submission.submittedAt.toISOString().slice(0, 19).replace("T", " ")}
                    </span>
                  </summary>
                  <pre className="max-h-[520px] overflow-auto border-t border-slate-200 bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                    <code>{submission.code || "这次同步只拿到了提交记录，没有拿到代码内容。"}</code>
                  </pre>
                </details>
              ))
            ) : (
              <p className="text-sm text-slate-500">还没有同步到代码。去力扣同步页重新同步一次。</p>
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
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}
