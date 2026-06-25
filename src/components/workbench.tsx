"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  Code2,
  DatabaseZap,
  ExternalLink,
  FileText,
  Flame,
  ListChecks,
  LogOut,
  Minus,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings2,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";

type ActiveView = "today" | "weekly" | "problems" | "reviews" | "stats" | "sync";
type WeekDay = DashboardData["availability"][number];
type WeekPlans = DashboardData["weekPlans"];

const navItems: { href: string; key: ActiveView; label: string; icon: typeof Target }[] = [
  { href: "/today", key: "today", label: "今日任务", icon: Target },
  { href: "/weekly", key: "weekly", label: "周计划", icon: CalendarDays },
  { href: "/problems", key: "problems", label: "题库画像", icon: BookOpen },
  { href: "/reviews", key: "reviews", label: "复习队列", icon: ListChecks },
  { href: "/stats", key: "stats", label: "统计", icon: DatabaseZap },
  { href: "/settings/sync", key: "sync", label: "力扣同步", icon: Settings2 },
];

const viewTitle: Record<ActiveView, { title: string; subtitle: string }> = {
  today: { title: "今日任务", subtitle: "只看今天要处理的题目，打开力扣后做题，完成后标记已处理即可。" },
  weekly: { title: "周计划", subtitle: "设置每天要完成的题量，系统按艾宾浩斯遗忘曲线实时排题。" },
  problems: { title: "Hot100 题库画像", subtitle: "用提交次数、AC 次数、正确率和复习风险判断每道题的状态。" },
  reviews: { title: "复习队列", subtitle: "优先处理到期、逾期和高风险旧题。" },
  stats: { title: "统计", subtitle: "查看整体进度、标签覆盖和复习节奏。" },
  sync: { title: "力扣同步", subtitle: "粘贴 leetcode.cn Cookie，同步 AC 状态、提交画像和最近代码。" },
};

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const difficultyClass = {
  EASY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700",
  HARD: "border-red-200 bg-red-50 text-red-700",
};
const kindLabel = { REVIEW: "复习", RETEST: "重测", NEW: "新题" };
const APP_VERSION = "v0.4.0";
const APP_UPDATED = "2026-06-25";
const DEFAULT_DAILY_COUNT = 3;

function formatYmd(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return `${String(date.getUTCFullYear()).slice(2)}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function Workbench({ data, active }: { data: DashboardData; active: ActiveView }) {
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  // null = untouched: use the CSS responsive default (open on desktop, hidden
  // on mobile). Once the user toggles, the boolean takes over.
  const [sidebarOpen, setSidebarOpen] = useState<boolean | null>(null);

  function toggleSidebar() {
    setSidebarOpen((prev) =>
      prev === null ? !window.matchMedia("(min-width: 1024px)").matches : !prev,
    );
  }
  const completion = Math.round((data.stats.accepted / Math.max(1, data.stats.total)) * 100);

  async function requestJson(path: string, body?: unknown, method = "POST") {
    setBusy(path);
    setMessage("");
    const response = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: typeof body === "undefined" ? undefined : JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy("");

    if (!response.ok) {
      setMessage(payload.error ?? "操作失败");
      return false;
    }

    return true;
  }

  // Regenerate the whole week from per-day problem counts. Returns the fresh
  // week plans so the weekly view can update in place (real-time).
  async function generateWeekly(counts: Record<string, number>) {
    setBusy("/api/plans/generate");
    setMessage("");
    const response = await fetch("/api/plans/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ counts }),
    });
    setBusy("");

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(payload.error ?? "排题失败");
      return null;
    }

    const payload = (await response.json()) as { weekPlans: DashboardData["weekPlans"] };
    return payload.weekPlans;
  }

  async function regeneratePlan() {
    const counts: Record<string, number> = {};
    for (const day of data.availability) {
      counts[day.date] = DEFAULT_DAILY_COUNT;
    }
    for (const plan of data.weekPlans) {
      counts[plan.date] = plan.items.length || DEFAULT_DAILY_COUNT;
    }
    const result = await generateWeekly(counts);
    if (result) window.location.reload();
  }

  async function syncLeetCode() {
    const ok = await requestJson("/api/sync/leetcode-cn", { cookie, syncCode: true });
    if (ok) window.location.reload();
  }

  async function addTodayTask() {
    const ok = await requestJson("/api/today/tasks/add", {});
    if (ok) window.location.reload();
  }

  async function removeItem(id: string) {
    const ok = await requestJson(`/api/plan-items/${id}`, undefined, "DELETE");
    if (ok) window.location.reload();
  }

  async function markItem(
    id: string,
    feelingScore: number,
    reviewAfterDays?: number,
    noteMarkdown?: string,
    noteSyntax?: string,
  ) {
    const ok = await requestJson(
      `/api/plan-items/${id}`,
      { feelingScore, reviewAfterDays, noteMarkdown, noteSyntax },
      "PATCH",
    );
    if (ok) window.location.reload();
  }

  async function excludeProblem(problemId: string, planItemId?: string) {
    const ok = await requestJson(`/api/problems/${problemId}`, { isEnabled: false }, "PUT");
    if (!ok) return;
    if (planItemId) {
      await requestJson(`/api/plan-items/${planItemId}`, undefined, "DELETE");
    }
    window.location.reload();
  }

  async function setProblemEnabled(problemId: string, isEnabled: boolean) {
    const ok = await requestJson(`/api/problems/${problemId}`, { isEnabled }, "PUT");
    if (ok) window.location.reload();
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {sidebarOpen === true ? (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          aria-hidden
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white px-4 py-5 transition-transform duration-200 ${
          sidebarOpen === null
            ? "-translate-x-full lg:translate-x-0"
            : sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full"
        }`}
      >
        <div className="flex items-start gap-3 px-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Target size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Hot100 复习计划</div>
            <div className="text-xs text-slate-500">Ebbinghaus Planner</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{APP_VERSION} · 更新于 {APP_UPDATED}</div>
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
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
          className="mt-auto flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
        >
          <LogOut size={17} />
          退出登录
        </button>
      </aside>

      <main
        className={`transition-[padding] duration-200 ${
          sidebarOpen === false ? "lg:pl-0" : "lg:pl-64"
        }`}
      >
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="收起 / 展开侧边栏"
              >
                <PanelLeft size={18} />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">{viewTitle[active].title}</h1>
                <p className="mt-1 text-sm text-slate-500">{viewTitle[active].subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600">
                <span className={`h-2 w-2 rounded-full ${data.syncState.status === "SUCCESS" ? "bg-emerald-500" : "bg-amber-500"}`} />
                力扣同步 {data.syncState.acceptedCount}/{data.syncState.checkedCount}
              </span>
              <button
                onClick={regeneratePlan}
                disabled={Boolean(busy)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
              >
                <RefreshCw size={15} />
                重新排题
              </button>
            </div>
          </div>
          {message ? <p className="mt-3 text-sm text-red-600">{message}</p> : null}
        </header>

        <div className="px-5 py-5">
          {active === "today" ? (
            <TodayView
              data={data}
              onAdd={addTodayTask}
              onMark={markItem}
              onRemove={removeItem}
              onExclude={excludeProblem}
              completion={completion}
            />
          ) : null}
          {active === "weekly" ? (
            <WeeklyView
              days={data.availability}
              initialPlans={data.weekPlans}
              onGenerate={generateWeekly}
              busy={Boolean(busy)}
            />
          ) : null}
          {active === "problems" ? <ProblemsView data={data} onToggleEnabled={setProblemEnabled} /> : null}
          {active === "reviews" ? <ReviewsView data={data} onToggleEnabled={setProblemEnabled} /> : null}
          {active === "stats" ? <StatsView data={data} completion={completion} /> : null}
          {active === "sync" ? (
            <SyncView data={data} cookie={cookie} setCookie={setCookie} syncLeetCode={syncLeetCode} busy={busy} />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function TodayView({
  data,
  onAdd,
  onMark,
  onRemove,
  onExclude,
  completion,
}: {
  data: DashboardData;
  onAdd: () => void;
  onMark: (
    id: string,
    feelingScore: number,
    reviewAfterDays?: number,
    noteMarkdown?: string,
    noteSyntax?: string,
  ) => void;
  onRemove: (id: string) => void;
  onExclude: (problemId: string, planItemId?: string) => void;
  completion: number;
}) {
  const items = data.todayPlan?.items ?? [];

  return (
    <div className="space-y-5">
      <MetricGrid data={data} completion={completion} />
      <div className="flex justify-end">
        <button
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus size={15} />
          添加一题
        </button>
      </div>
      <Panel title="今日计划" action={data.todayPlan ? `${items.length} 题` : "未生成"}>
        {items.length ? (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <TaskRow key={item.id} item={item} onMark={onMark} onRemove={onRemove} onExclude={onExclude} />
            ))}
          </div>
        ) : (
          <EmptyState text="还没有今日计划。去周计划页设置每天题量，然后排题。" />
        )}
      </Panel>
    </div>
  );
}

function WeeklyView({
  days,
  initialPlans,
  onGenerate,
  busy,
}: {
  days: WeekDay[];
  initialPlans: WeekPlans;
  onGenerate: (counts: Record<string, number>) => Promise<WeekPlans | null>;
  busy: boolean;
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const day of days) {
      const plan = initialPlans.find((item) => item.date === day.date);
      initial[day.date] = plan ? plan.items.length : DEFAULT_DAILY_COUNT;
    }
    return initial;
  });
  const plansByDate = new Map(plans.map((plan) => [plan.date, plan.items]));

  async function changeCount(date: string, delta: number) {
    const next = Math.max(0, Math.min(30, (counts[date] ?? 0) + delta));
    const nextCounts = { ...counts, [date]: next };
    setCounts(nextCounts);
    const result = await onGenerate(nextCounts);
    if (result) {
      setPlans(result);
    }
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-500">
        调整每天的题量，系统会按艾宾浩斯遗忘曲线（到期/逾期复习优先，其次新题）实时重新排题。
      </p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {days.map((day) => (
          <div key={day.date} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{weekdayLabels[day.weekday]}</span>
                <span className="text-xs text-slate-500">{formatYmd(day.date)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => changeCount(day.date, -1)}
                  disabled={busy || (counts[day.date] ?? 0) <= 0}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  title="少一题"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">{counts[day.date] ?? 0}</span>
                <button
                  onClick={() => changeCount(day.date, 1)}
                  disabled={busy || (counts[day.date] ?? 0) >= 30}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  title="多一题"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <DayPlanList items={plansByDate.get(day.date) ?? []} />
          </div>
        ))}
      </div>
    </section>
  );
}

function DayPlanList({ items }: { items: DashboardData["weekPlans"][number]["items"] }) {
  const totalMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-500">安排题目</span>
        <span className="text-slate-400">{items.length ? `${items.length} 题 · ${totalMinutes}m` : "未排"}</span>
      </div>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={item.problem.leetcodeCnUrl}
                target="_blank"
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-slate-50"
                title={item.problem.titleCn}
              >
                <span className="font-mono text-[11px] text-slate-400">#{item.problem.frontendId}</span>
                <span
                  className={`min-w-0 flex-1 truncate text-xs ${
                    item.isCompleted ? "text-slate-400 line-through" : "text-slate-700"
                  }`}
                >
                  {item.problem.titleCn}
                </span>
                <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${difficultyClass[item.problem.difficulty]}`}>
                  {item.problem.difficulty === "EASY" ? "易" : item.problem.difficulty === "MEDIUM" ? "中" : "难"}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">{kindLabel[item.kind]}</span>
                {item.isCompleted ? <Check size={12} className="shrink-0 text-emerald-500" /> : null}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">点下方“保存时段并生成周计划”自动排题。</p>
      )}
    </div>
  );
}

function ProblemsView({
  data,
  onToggleEnabled,
}: {
  data: DashboardData;
  onToggleEnabled: (problemId: string, isEnabled: boolean) => void;
}) {
  return (
    <Panel title="题库画像" action={`${data.problems.length} 题`}>
      <ProblemTable problems={data.problems} onToggleEnabled={onToggleEnabled} />
    </Panel>
  );
}

function ReviewsView({
  data,
  onToggleEnabled,
}: {
  data: DashboardData;
  onToggleEnabled: (problemId: string, isEnabled: boolean) => void;
}) {
  const reviews = [...data.problems]
    .filter((problem) => problem.isEnabled !== false && (problem.nextReviewDate || problem.reviewRiskScore >= 50))
    .sort((a, b) => b.reviewRiskScore - a.reviewRiskScore);

  return (
    <Panel title="到期与高风险旧题" action={`${reviews.length} 题`}>
      <ProblemTable problems={reviews} onToggleEnabled={onToggleEnabled} />
    </Panel>
  );
}

function StatsView({ data, completion }: { data: DashboardData; completion: number }) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const scored = data.problems
    .filter((problem) => problem.feelingSessionCount > 0 && problem.avgFeelingScore !== null)
    .sort((a, b) => {
      const diff = (a.avgFeelingScore ?? 0) - (b.avgFeelingScore ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });

  return (
    <div className="space-y-5">
      <MetricGrid data={data} completion={completion} />
      <Panel title="做题反馈分数（每题平均分）" action={`${scored.length} 题`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">分数越高代表越不熟（0 = 一次 AC，5 = 没思路）。点按钮切换升/降序。</p>
          <button
            onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowUpDown size={13} />
            按平均分{sortDir === "asc" ? "升序" : "降序"}
          </button>
        </div>
        {scored.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="border-b border-slate-200 py-2 font-medium">题目</th>
                  <th className="border-b border-slate-200 py-2 font-medium">难度</th>
                  <th className="border-b border-slate-200 py-2 font-medium">平均分</th>
                  <th className="border-b border-slate-200 py-2 font-medium">做题次数</th>
                </tr>
              </thead>
              <tbody>
                {scored.map((problem) => (
                  <tr key={problem.id}>
                    <td className="border-b border-slate-100 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">#{problem.frontendId}</span>
                        <a href={`/problems/${problem.id}`} className="font-medium hover:text-blue-600">
                          {problem.titleCn}
                        </a>
                      </div>
                    </td>
                    <td className="border-b border-slate-100 py-2.5">
                      <Badge className={difficultyClass[problem.difficulty]}>{problem.difficulty}</Badge>
                    </td>
                    <td className="border-b border-slate-100 py-2.5">{scorePill(problem.avgFeelingScore ?? 0)}</td>
                    <td className="border-b border-slate-100 py-2.5 text-slate-600">{problem.feelingSessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="还没有带评分的做题记录。在今日任务里完成题目并打分后会出现在这里。" />
        )}
      </Panel>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="标签覆盖">
          <div className="grid gap-3 md:grid-cols-2">
            {data.stats.byTag.map((tag) => (
              <div key={tag.tag}>
                <div className="mb-1 flex justify-between text-sm text-slate-600">
                  <span>{tag.tag}</span>
                  <span>{tag.accepted}/{tag.total}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-blue-500" style={{ width: `${(tag.accepted / tag.total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <ProgressPanel data={data} completion={completion} />
      </div>
    </div>
  );
}

function scorePill(score: number) {
  const tone = score < 1.5 ? "bg-emerald-50 text-emerald-700" : score < 3 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>{score.toFixed(2)}</span>;
}

function SyncView({
  data,
  cookie,
  setCookie,
  syncLeetCode,
  busy,
}: {
  data: DashboardData;
  cookie: string;
  setCookie: (value: string) => void;
  syncLeetCode: () => void;
  busy: string;
}) {
  return (
    <div className="max-w-3xl space-y-5">
      <Panel title="Cookie 同步" action={data.syncState.hasCookie ? "已保存 Cookie" : "未配置"}>
        <textarea
          value={cookie}
          onChange={(event) => setCookie(event.target.value)}
          placeholder="粘贴 leetcode.cn Cookie；留空则使用已保存 Cookie 重新同步"
          className="min-h-36 w-full resize-y rounded-md border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <button
          onClick={syncLeetCode}
          disabled={Boolean(busy)}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
        >
          <RefreshCw size={16} />
          {busy === "/api/sync/leetcode-cn" ? "同步中..." : "同步 AC 状态和提交画像"}
        </button>
      </Panel>
      <Panel title="最近同步状态">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="状态" value={data.syncState.status} />
          <Info label="已 AC / 已检查" value={`${data.syncState.acceptedCount}/${data.syncState.checkedCount}`} />
          <Info label="最近同步" value={data.syncState.lastSyncedAt?.slice(0, 19).replace("T", " ") ?? "-"} />
          <Info label="最近代码同步" value={data.syncState.lastCodeSyncedAt?.slice(0, 19).replace("T", " ") ?? "-"} />
          <Info label="错误" value={data.syncState.lastError || "-"} />
          <Info label="代码同步错误" value={data.syncState.lastCodeSyncError || "-"} />
        </dl>
      </Panel>
      <Panel title="服务器自动同步" action="cron">
        <p className="text-sm leading-6 text-slate-600">
          在服务器 `.env` 里配置 `SYNC_SECRET`，然后用定时任务每天调用这个接口。Cookie 过期时重新在本页粘贴一次即可，历史笔记和代码不会被清空。
        </p>
        <code className="mt-3 block overflow-x-auto rounded-md bg-slate-950 p-3 text-xs leading-6 text-slate-100">
          curl -fsS -X POST &quot;https://你的域名/api/sync/leetcode-cn/cron?secret=你的_SYNC_SECRET&quot;
        </code>
      </Panel>
    </div>
  );
}

const feelingLabels = ["一次 AC", "基本顺利", "小错误", "卡了一会", "靠提示", "没思路"];
const feelingDefaultDays = [7, 5, 3, 2, 1, 1];

function TaskRow({
  item,
  onMark,
  onRemove,
  onExclude,
}: {
  item: NonNullable<DashboardData["todayPlan"]>["items"][number];
  onMark: (
    id: string,
    feelingScore: number,
    reviewAfterDays?: number,
    noteMarkdown?: string,
    noteSyntax?: string,
  ) => void;
  onRemove: (id: string) => void;
  onExclude: (problemId: string, planItemId?: string) => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feelingScore, setFeelingScore] = useState<number | null>(item.session?.feelingScore ?? null);
  const [reviewAfterDays, setReviewAfterDays] = useState(item.session?.reviewAfterDays ?? 7);
  const [noteMarkdown, setNoteMarkdown] = useState(item.session?.noteMarkdown ?? "");
  const [noteSyntax, setNoteSyntax] = useState(item.session?.noteSyntax ?? "");

  function chooseScore(score: number) {
    setFeelingScore(score);
    setReviewAfterDays(feelingDefaultDays[score]);
  }

  function submitFeedback() {
    if (feelingScore === null) {
      return;
    }

    onMark(item.id, feelingScore, reviewAfterDays, noteMarkdown, noteSyntax);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 lg:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">#{item.problem.frontendId}</span>
            <a href={item.problem.leetcodeCnUrl} target="_blank" className="font-medium text-slate-900 break-words hover:text-blue-600">
              {item.problem.titleCn}
            </a>
            <Badge className={difficultyClass[item.problem.difficulty]}>{item.problem.difficulty}</Badge>
            <span className="text-xs text-slate-500">{kindLabel[item.kind]}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><BarChart3 size={13} /> 正确率 {item.problem.acceptedRate}%</span>
            <span className="inline-flex items-center gap-1"><RefreshCw size={13} /> 提交 {item.problem.totalSubmissions}</span>
            <span className="inline-flex items-center gap-1"><Flame size={13} /> 风险 {item.problem.reviewRiskScore}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:w-[320px] lg:shrink-0">
          <a
            href={item.problem.leetcodeCnUrl}
            target="_blank"
            className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={14} />
            打开力扣
          </a>
          {item.isCompleted ? (
            <>
              <span className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md bg-emerald-50 px-2 text-sm font-medium text-emerald-700">
                <Check size={14} /> 已处理
              </span>
              <button
                onClick={() => setFeedbackOpen((open) => !open)}
                className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title="修改做题感觉或笔记"
              >
                <FileText size={14} />
                {feedbackOpen ? "收起" : "编辑反馈"}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setFeedbackOpen((open) => !open)}
                className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md bg-slate-900 px-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Check size={14} />
                已处理
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-sm font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                title="从今日任务移除"
              >
                <Trash2 size={14} />
                移除
              </button>
            </>
          )}
        </div>
      </div>
      {feedbackOpen ? (
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-900">做题感觉{item.isCompleted ? "（编辑）" : ""}</div>
              <div className="mt-1 text-xs text-slate-500">0 表示一次 AC，5 表示完全没思路。</div>
            </div>
            <button
              onClick={() => setFeedbackOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white"
              title="关闭"
            >
              <X size={15} />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-6 gap-2">
            {feelingLabels.map((label, score) => (
              <button
                key={label}
                onClick={() => chooseScore(score)}
                className={`rounded-md border px-2 py-2 text-center text-xs transition ${
                  feelingScore === score
                    ? "border-blue-500 bg-blue-50 font-semibold text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs">
                  {score}
                </span>
                {label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            几天后复习
            <input
              type="number"
              min={1}
              max={60}
              value={reviewAfterDays}
              onChange={(event) => setReviewAfterDays(Math.max(1, Number(event.target.value) || 1))}
              className="h-9 w-20 rounded-md border border-slate-300 px-2 text-sm"
            />
          </label>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="text-sm text-slate-600">
              <span className="inline-flex items-center gap-1 font-medium text-slate-900">
                <BookOpen size={14} /> 解题思路笔记
              </span>
              <textarea
                value={noteMarkdown}
                onChange={(event) => setNoteMarkdown(event.target.value)}
                placeholder="这道题的思路、卡点、错因、下次复习要注意的点（支持 Markdown）"
                className="mt-2 min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="text-sm text-slate-600">
              <span className="inline-flex items-center gap-1 font-medium text-slate-900">
                <Code2 size={14} /> C++ 语法 / 知识点
              </span>
              <textarea
                value={noteSyntax}
                onChange={(event) => setNoteSyntax(event.target.value)}
                placeholder="C++ 语法、STL 成员函数用法、容器/迭代器等基础知识点，方便后续整理复习"
                className="mt-2 min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => onExclude(item.problem.id, item.id)}
              className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              title="标记为不会考的题，之后不再安排复习（历史笔记保留）"
            >
              <Trash2 size={14} />
              这题不会考，不再复习
            </button>
            <button
              onClick={submitFeedback}
              disabled={feelingScore === null}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
            >
              <Check size={15} />
              {item.isCompleted ? "更新反馈" : "提交反馈"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProblemTable({
  problems,
  onToggleEnabled,
}: {
  problems: DashboardData["problems"];
  onToggleEnabled: (problemId: string, isEnabled: boolean) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="border-b border-slate-200 py-2 font-medium">题目</th>
            <th className="border-b border-slate-200 py-2 font-medium">难度</th>
            <th className="border-b border-slate-200 py-2 font-medium">提交</th>
            <th className="border-b border-slate-200 py-2 font-medium">AC</th>
            <th className="border-b border-slate-200 py-2 font-medium">正确率</th>
            <th className="border-b border-slate-200 py-2 font-medium">笔记</th>
            <th className="border-b border-slate-200 py-2 font-medium">代码</th>
            <th className="border-b border-slate-200 py-2 font-medium">最近 AC</th>
            <th className="border-b border-slate-200 py-2 font-medium">复习风险</th>
            <th className="border-b border-slate-200 py-2 font-medium">下次复习</th>
            <th className="border-b border-slate-200 py-2 font-medium">标签</th>
            <th className="border-b border-slate-200 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((problem) => {
            const disabled = problem.isEnabled === false;

            return (
            <tr key={problem.id} className={disabled ? "opacity-50" : undefined}>
              <td className="border-b border-slate-100 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">#{problem.frontendId}</span>
                  <a href={`/problems/${problem.id}`} className="font-medium hover:text-blue-600">
                    {problem.titleCn}
                  </a>
                  <a href={problem.leetcodeCnUrl} target="_blank" className="text-slate-400 hover:text-blue-600" title="打开力扣">
                    <ExternalLink size={13} />
                  </a>
                  {disabled ? (
                    <span className="inline-flex rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">已移除</span>
                  ) : null}
                </div>
              </td>
              <td className="border-b border-slate-100 py-3"><Badge className={difficultyClass[problem.difficulty]}>{problem.difficulty}</Badge></td>
              <td className="border-b border-slate-100 py-3"><IconMetric icon={RefreshCw} value={problem.totalSubmissions} /></td>
              <td className="border-b border-slate-100 py-3"><IconMetric icon={Check} value={problem.acceptedSubmissions} /></td>
              <td className="border-b border-slate-100 py-3">{ratePill(problem.acceptedRate)}</td>
              <td className="border-b border-slate-100 py-3"><IconMetric icon={FileText} value={problem.noteCount} /></td>
              <td className="border-b border-slate-100 py-3"><IconMetric icon={Code2} value={problem.codeCount} /></td>
              <td className="border-b border-slate-100 py-3 text-slate-600">{formatYmd(problem.lastAcceptedAt)}</td>
              <td className="border-b border-slate-100 py-3">{riskPill(problem.reviewRiskScore)}</td>
              <td className="border-b border-slate-100 py-3 text-slate-600">{formatYmd(problem.nextReviewDate)}</td>
              <td className="border-b border-slate-100 py-3 text-xs text-slate-500">{problem.tags.split(",").slice(0, 3).join(" / ")}</td>
              <td className="border-b border-slate-100 py-3">
                {disabled ? (
                  <button
                    onClick={() => onToggleEnabled(problem.id, true)}
                    className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    title="恢复复习这道题"
                  >
                    <RefreshCw size={13} /> 恢复
                  </button>
                ) : (
                  <button
                    onClick={() => onToggleEnabled(problem.id, false)}
                    className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    title="不再复习这道题（历史笔记保留）"
                  >
                    <Trash2 size={13} /> 移除
                  </button>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricGrid({ data, completion }: { data: DashboardData; completion: number }) {
  const todayCount = data.todayPlan?.items.length ?? 0;
  const todayDone = data.todayPlan?.items.filter((item) => item.isCompleted).length ?? 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="Hot100 完成" value={`${data.stats.accepted}/${data.stats.total}`} hint={`${completion}%`} />
      <Metric label="做题记录" value={`${data.stats.sessions}`} hint="累计 session" />
      <Metric label="今日题量" value={`${todayDone}/${todayCount}`} hint="已处理 / 今日题数" />
    </div>
  );
}

function ProgressPanel({ data, completion }: { data: DashboardData; completion: number }) {
  return (
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
  );
}

function Metric({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "warning" }) {
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

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
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

function IconMetric({ icon: Icon, value }: { icon: typeof RefreshCw; value: number }) {
  return <span className="inline-flex items-center gap-1 text-slate-700"><Icon size={14} /> {value}</span>;
}

function ratePill(rate: number) {
  const tone = rate === 0 ? "bg-slate-50 text-slate-500" : rate < 50 ? "bg-red-50 text-red-700" : rate < 75 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>{rate}%</span>;
}

function riskPill(score: number) {
  const tone = score >= 70 ? "bg-red-50 text-red-700" : score >= 40 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700";
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${tone}`}><AlertTriangle size={13} /> {score}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      {text}
    </div>
  );
}
