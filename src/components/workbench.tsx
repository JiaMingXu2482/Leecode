"use client";

import {
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  ListChecks,
  RefreshCw,
  Settings2,
  Target,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";

type ActiveView = "today" | "weekly" | "problems" | "reviews" | "stats" | "sync";

const navItems: { href: string; key: ActiveView; label: string; icon: typeof Target }[] = [
  { href: "/today", key: "today", label: "今日任务", icon: Target },
  { href: "/weekly", key: "weekly", label: "本周可用时间", icon: CalendarDays },
  { href: "/problems", key: "problems", label: "Hot100 题库", icon: BookOpen },
  { href: "/reviews", key: "reviews", label: "到期复习", icon: ListChecks },
  { href: "/stats", key: "stats", label: "掌握度", icon: DatabaseZap },
  { href: "/settings/sync", key: "sync", label: "力扣同步", icon: Settings2 },
];

const difficultyClass = {
  EASY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  HARD: "bg-red-50 text-red-700 border-red-200",
};

const kindLabel = {
  REVIEW: "到期复习",
  RETEST: "旧题重测",
  NEW: "新题推进",
};

export function Workbench({ data, active }: { data: DashboardData; active: ActiveView }) {
  const [availability, setAvailability] = useState(data.availability);
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const completion = Math.round((data.stats.accepted / Math.max(1, data.stats.total)) * 100);
  const visibleProblems = useMemo(() => {
    if (active === "reviews") {
      return data.problems.filter((problem) => problem.nextReviewDate);
    }

    return data.problems;
  }, [active, data.problems]);

  async function postJson(path: string, body: unknown) {
    setBusy(path);
    setMessage("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy("");

    if (!response.ok) {
      setMessage(payload.error ?? "操作失败");
      return false;
    }

    return true;
  }

  async function syncLeetCode() {
    const ok = await postJson("/api/sync/leetcode-cn", { cookie });
    if (ok) {
      window.location.reload();
    }
  }

  async function generatePlan() {
    const ok = await postJson("/api/plans/generate", { availability });
    if (ok) {
      window.location.reload();
    }
  }

  async function completeItem(formData: FormData) {
    const ok = await postJson("/api/sessions", {
      planItemId: formData.get("planItemId"),
      problemId: formData.get("problemId"),
      kind: String(formData.get("kind")).toLowerCase(),
      rating: formData.get("rating"),
      spentMinutes: Number(formData.get("spentMinutes") || 30),
      noteLastBlocker: formData.get("noteLastBlocker"),
    });

    if (ok) {
      window.location.reload();
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-4 py-5 lg:block">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Target size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold">Hot100 复习计划</div>
            <div className="text-xs text-slate-500">Ebbinghaus Planner</div>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;

            return (
              <a
                key={item.key}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm transition ${
                  selected
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">今日任务</h1>
              <p className="mt-1 text-sm text-slate-500">
                {data.today}，优先处理到期复习，再推进旧题重测和新题。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600">
                <span className={`h-2 w-2 rounded-full ${data.syncState.status === "SUCCESS" ? "bg-emerald-500" : "bg-amber-500"}`} />
                力扣同步 {data.syncState.acceptedCount}/{data.syncState.checkedCount}
              </span>
              <button
                onClick={generatePlan}
                disabled={Boolean(busy)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                <RefreshCw size={15} />
                生成周计划
              </button>
            </div>
          </div>
          {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}
        </header>

        <div className="grid gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0 space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <Metric label="Hot100 完成" value={`${data.stats.accepted}/${data.stats.total}`} hint={`${completion}%`} />
              <Metric label="复习债" value={`${data.stats.dueReviews}`} hint="到期/逾期" tone="warning" />
              <Metric label="做题记录" value={`${data.stats.sessions}`} hint="累计 session" />
              <Metric
                label="今日预算"
                value={`${data.todayPlan?.totalEstimatedMinutes ?? 0}m`}
                hint={`${data.todayPlan?.availableMinutes ?? 0}m 可用`}
              />
            </div>

            <Panel title="今日任务" action={data.todayPlan ? `${data.todayPlan.items.length} 项` : "未生成"}>
              {data.todayPlan?.items.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500">
                        <th className="border-b border-slate-200 py-2 font-medium">题目</th>
                        <th className="border-b border-slate-200 py-2 font-medium">类型</th>
                        <th className="border-b border-slate-200 py-2 font-medium">估时</th>
                        <th className="border-b border-slate-200 py-2 font-medium">完成反馈</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.todayPlan.items.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="border-b border-slate-100 py-3 pr-4">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 font-mono text-xs text-slate-400">#{item.problem.frontendId}</span>
                              <div>
                                <a href={item.problem.leetcodeCnUrl} target="_blank" className="font-medium text-slate-900 hover:text-blue-600">
                                  {item.problem.titleCn}
                                </a>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <Badge className={difficultyClass[item.problem.difficulty]}>{item.problem.difficulty}</Badge>
                                  <span className="text-xs text-slate-500">{item.problem.tags.split(",").slice(0, 3).join(" / ")}</span>
                                </div>
                                {item.problem.noteLastBlocker ? (
                                  <p className="mt-2 text-xs text-amber-700">上次卡点：{item.problem.noteLastBlocker}</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="border-b border-slate-100 py-3 text-slate-600">{kindLabel[item.kind]}</td>
                          <td className="border-b border-slate-100 py-3 text-slate-600">{item.estimatedMinutes}m</td>
                          <td className="border-b border-slate-100 py-3">
                            {item.isCompleted ? (
                              <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                                <CheckCircle2 size={15} /> 已完成
                              </span>
                            ) : (
                              <form action={completeItem} className="flex flex-wrap gap-2">
                                <input type="hidden" name="planItemId" value={item.id} />
                                <input type="hidden" name="problemId" value={item.problem.id} />
                                <input type="hidden" name="kind" value={item.kind} />
                                <select name="rating" className="h-8 rounded-md border border-slate-300 px-2 text-xs">
                                  <option value="mastered">熟练</option>
                                  <option value="ok">基本会</option>
                                  <option value="shaky">模糊</option>
                                  <option value="forgot">不会</option>
                                </select>
                                <input name="spentMinutes" defaultValue={item.estimatedMinutes} className="h-8 w-16 rounded-md border border-slate-300 px-2 text-xs" />
                                <input name="noteLastBlocker" placeholder="卡点" className="h-8 w-28 rounded-md border border-slate-300 px-2 text-xs" />
                                <button className="h-8 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white">记录</button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState text="还没有今日计划。先在右侧确认可用时间，然后生成周计划。" />
              )}
            </Panel>

            <Panel title={active === "reviews" ? "到期复习队列" : "Hot100 题库"} action={`${visibleProblems.length} 题`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="border-b border-slate-200 py-2 font-medium">序号</th>
                      <th className="border-b border-slate-200 py-2 font-medium">题目</th>
                      <th className="border-b border-slate-200 py-2 font-medium">状态</th>
                      <th className="border-b border-slate-200 py-2 font-medium">下次复习</th>
                      <th className="border-b border-slate-200 py-2 font-medium">标签</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProblems.slice(0, active === "problems" ? 100 : 18).map((problem) => (
                      <tr key={problem.id}>
                        <td className="border-b border-slate-100 py-3 font-mono text-xs text-slate-400">#{problem.frontendId}</td>
                        <td className="border-b border-slate-100 py-3">
                          <a href={problem.leetcodeCnUrl} target="_blank" className="font-medium hover:text-blue-600">
                            {problem.titleCn}
                          </a>
                        </td>
                        <td className="border-b border-slate-100 py-3">
                          <span className={problem.isAccepted ? "text-emerald-700" : "text-slate-500"}>
                            {problem.isAccepted ? problem.mastery ?? "已 AC" : "未同步/未通过"}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 py-3 text-slate-600">{problem.nextReviewDate ?? "-"}</td>
                        <td className="border-b border-slate-100 py-3 text-xs text-slate-500">{problem.tags.split(",").slice(0, 3).join(" / ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>

          <aside className="min-w-0 space-y-5">
            <Panel title="本周可用时间" action="2-3h/天">
              <div className="space-y-2">
                {availability.map((slot, index) => (
                  <div key={slot.date} className="grid grid-cols-[1fr_84px_28px] items-center gap-2">
                    <span className="text-sm text-slate-700">{slot.date}</span>
                    <input
                      value={Math.round(slot.availableMinutes / 60 * 10) / 10}
                      onChange={(event) => {
                        const next = [...availability];
                        next[index] = {
                          ...slot,
                          availableMinutes: Math.max(0, Number(event.target.value) * 60),
                        };
                        setAvailability(next);
                      }}
                      type="number"
                      min="0"
                      step="0.5"
                      className="h-8 rounded-md border border-slate-300 px-2 text-sm"
                    />
                    <input
                      type="checkbox"
                      checked={slot.isAvailable}
                      onChange={(event) => {
                        const next = [...availability];
                        next[index] = { ...slot, isAvailable: event.target.checked };
                        setAvailability(next);
                      }}
                      className="h-4 w-4"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={generatePlan}
                disabled={Boolean(busy)}
                className="mt-4 h-9 w-full rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                生成周计划
              </button>
            </Panel>

            <Panel title="力扣同步" action={data.syncState.hasCookie ? "Cookie 已保存" : "未配置"}>
              <textarea
                value={cookie}
                onChange={(event) => setCookie(event.target.value)}
                placeholder="粘贴 leetcode.cn Cookie；留空则使用已保存 Cookie 重新同步"
                className="min-h-24 w-full resize-y rounded-md border border-slate-300 p-3 text-xs leading-5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={syncLeetCode}
                disabled={Boolean(busy)}
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:bg-slate-100"
              >
                <RefreshCw size={15} />
                {busy === "/api/sync/leetcode-cn" ? "同步中..." : "同步 AC 状态"}
              </button>
              {data.syncState.lastError ? <p className="mt-2 text-xs text-red-600">{data.syncState.lastError}</p> : null}
            </Panel>

            <Panel title="掌握度" action={`${completion}%`}>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-emerald-500" style={{ width: `${completion}%` }} />
              </div>
              <div className="mt-4 space-y-3">
                {data.stats.byTag.map((tag) => (
                  <div key={tag.tag}>
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>{tag.tag}</span>
                      <span>{tag.accepted}/{tag.total}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-blue-500" style={{ width: `${(tag.accepted / tag.total) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        {tone === "warning" ? <Clock3 size={14} className="text-amber-600" /> : null}
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-xs text-slate-500">{hint}</span>
      </div>
    </div>
  );
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action ? <span className="text-xs text-slate-500">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      {text}
    </div>
  );
}
