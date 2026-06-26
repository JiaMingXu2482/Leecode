"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  DatabaseZap,
  ExternalLink,
  FileText,
  ListChecks,
  LogOut,
  Minus,
  Moon,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings2,
  Sun,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";
import { TOPIC_GROUPS } from "@/lib/topics";

type ActiveView = "today" | "weekly" | "problems" | "reviews" | "stats" | "sync";
type WeekDay = DashboardData["availability"][number];
type WeekPlans = DashboardData["weekPlans"];

const navItems: { href: string; key: ActiveView; label: string; icon: typeof Target }[] = [
  { href: "/today", key: "today", label: "今日任务", icon: Target },
  { href: "/weekly", key: "weekly", label: "周计划", icon: CalendarDays },
  { href: "/problems", key: "problems", label: "题库画像", icon: BookOpen },
  { href: "/reviews", key: "reviews", label: "刷题计划", icon: ListChecks },
  { href: "/stats", key: "stats", label: "统计", icon: DatabaseZap },
  { href: "/settings/sync", key: "sync", label: "力扣同步", icon: Settings2 },
];

const viewTitle: Record<ActiveView, { title: string; subtitle: string }> = {
  today: { title: "今日任务", subtitle: "只看今天要处理的题目，打开力扣后做题，完成后标记已处理即可。" },
  weekly: { title: "周计划", subtitle: "设置每天要完成的题量，系统按艾宾浩斯遗忘曲线实时排题。" },
  problems: { title: "Hot100 题库画像", subtitle: "用提交次数、AC 次数、正确率和复习风险判断每道题的状态。" },
  reviews: { title: "刷题计划", subtitle: "按 Hot100 分类管理：勾选不想刷的题或整类，未勾选的进入刷题列表。" },
  stats: { title: "统计", subtitle: "每道题的做题反馈平均分，可按分数升序或降序排序。" },
  sync: { title: "力扣同步", subtitle: "粘贴 leetcode.cn Cookie，同步 AC 状态、提交画像和最近代码。" },
};

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const difficultyClass = {
  EASY: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300",
  MEDIUM: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  HARD: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300",
};
const kindLabel = { REVIEW: "复习", RETEST: "重测", NEW: "新题" };
const APP_VERSION = "v0.8.0";
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
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && !document.documentElement.classList.contains("dark")
      ? "light"
      : "dark",
  );
  const router = useRouter();

  function toggleSidebar() {
    setSidebarOpen((prev) =>
      prev === null ? !window.matchMedia("(min-width: 1024px)").matches : !prev,
    );
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {}
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


  async function syncLeetCode() {
    const ok = await requestJson("/api/sync/leetcode-cn", { cookie, syncCode: true });
    if (ok) router.refresh();
  }

  async function addTodayTask() {
    const ok = await requestJson("/api/today/tasks/add", {});
    if (ok) router.refresh();
  }

  async function removeItem(id: string) {
    const ok = await requestJson(`/api/plan-items/${id}`, undefined, "DELETE");
    if (ok) router.refresh();
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
    if (ok) router.refresh();
  }

  async function setProblemEnabled(problemId: string, isEnabled: boolean) {
    const ok = await requestJson(`/api/problems/${problemId}`, { isEnabled }, "PUT");
    if (ok) router.refresh();
  }

  async function bulkSetEnabled(problemIds: string[], isEnabled: boolean) {
    if (!problemIds.length) return;
    const ok = await requestJson("/api/problems", { problemIds, isEnabled }, "PATCH");
    if (ok) router.refresh();
  }

  return (
    <div className="min-h-screen bg-canvas text-fg">
      {sidebarOpen === true ? (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-btn-strong/30 lg:hidden"
          aria-hidden
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-surface px-4 py-5 transition-transform duration-200 ${
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
            <div className="text-xs text-fg-subtle">Ebbinghaus Planner</div>
            <div className="mt-0.5 text-[11px] text-fg-subtle">{APP_VERSION} · 更新于 {APP_UPDATED}</div>
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
                    ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "text-fg-muted hover:bg-muted hover:text-fg"
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
          className="mt-auto flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-fg-subtle transition hover:bg-muted hover:text-fg"
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
        <header className="sticky top-0 z-10 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-muted"
                title="收起 / 展开侧边栏"
              >
                <PanelLeft size={18} />
              </button>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight">{viewTitle[active].title}</h1>
                <p className="mt-1 text-sm text-fg-subtle">{viewTitle[active].subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-muted"
                title={theme === "dark" ? "切换到浅色" : "切换到深色"}
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <span className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-fg-muted">
                <span className={`h-2 w-2 rounded-full ${data.syncState.status === "SUCCESS" ? "bg-emerald-500" : "bg-amber-500"}`} />
                力扣同步 {data.syncState.acceptedCount}/{data.syncState.checkedCount}
              </span>
            </div>
          </div>
          {message ? <p className="mt-3 text-sm text-red-400">{message}</p> : null}
        </header>

        <div className="px-5 py-5">
          {active === "today" ? (
            <TodayView
              data={data}
              onAdd={addTodayTask}
              onMark={markItem}
              onRemove={removeItem}
              completion={completion}
            />
          ) : null}
          {active === "weekly" ? (
            <WeeklyView
              days={data.availability}
              initialPlans={data.weekPlans}
              history={data.weekHistory}
              onGenerate={generateWeekly}
              busy={Boolean(busy)}
            />
          ) : null}
          {active === "problems" ? <ProblemsView data={data} onToggleEnabled={setProblemEnabled} /> : null}
          {active === "reviews" ? (
            <TopicsView data={data} onToggleEnabled={setProblemEnabled} onBulkToggle={bulkSetEnabled} />
          ) : null}
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
  completion: number;
}) {
  const items = data.todayPlan?.items ?? [];
  const dateKey = data.todayPlan?.date ?? data.today;
  const dateLabel = `${weekdayLabels[new Date(`${dateKey}T00:00:00Z`).getUTCDay()]} ${formatYmd(dateKey)}`;

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
      <div className="rounded-lg border border-line bg-surface">
        <div className="relative flex items-center justify-center border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{dateLabel}</h2>
          <span className="absolute right-4 text-sm text-fg-subtle">{data.todayPlan ? `${items.length} 题` : "未生成"}</span>
        </div>
        {items.length ? (
          <div className="divide-y divide-line">
            {items.map((item) => (
              <TaskRow key={item.id} item={item} onMark={onMark} onRemove={onRemove} />
            ))}
          </div>
        ) : (
          <div className="p-4">
            <EmptyState text="还没有今日计划。去周计划页设置每天题量，然后排题。" />
          </div>
        )}
      </div>
    </div>
  );
}

function WeeklyView({
  days,
  initialPlans,
  history,
  onGenerate,
  busy,
}: {
  days: WeekDay[];
  initialPlans: WeekPlans;
  history: DashboardData["weekHistory"];
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
      <p className="text-sm text-fg-subtle">
        调整每天的题量，系统会按艾宾浩斯遗忘曲线（到期/逾期复习优先，其次新题）实时重新排题。
      </p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {days.map((day) => (
          <div key={day.date} className="rounded-lg border border-line bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{weekdayLabels[day.weekday]}</span>
                <span className="text-xs text-fg-subtle">{formatYmd(day.date)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => changeCount(day.date, -1)}
                  disabled={busy || (counts[day.date] ?? 0) <= 0}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-muted disabled:opacity-40"
                  title="少一题"
                >
                  <Minus size={14} />
                </button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">{counts[day.date] ?? 0}</span>
                <button
                  onClick={() => changeCount(day.date, 1)}
                  disabled={busy || (counts[day.date] ?? 0) >= 30}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-muted disabled:opacity-40"
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

      <div className="pt-2">
        <h2 className="mb-1 text-sm font-semibold">本周做题记录</h2>
        <p className="mb-3 text-xs text-fg-subtle">每天实际做了哪些题、当时的反馈分数和笔记，点开某天查看详情。</p>
        <WeekHistoryBoard history={history} />
      </div>
    </section>
  );
}

function WeekHistoryBoard({ history }: { history: DashboardData["weekHistory"] }) {
  const [openDate, setOpenDate] = useState<string | null>(history[0]?.date ?? null);

  if (!history.length) {
    return <p className="text-sm text-fg-subtle">最近还没有做题记录。完成今日任务并提交反馈后会出现在这里。</p>;
  }

  return (
    <div className="space-y-3">
      {history.map((day) => {
        const open = openDate === day.date;
        const weekday = weekdayLabels[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
        return (
          <div key={day.date} className="overflow-hidden rounded-lg border border-line bg-surface">
            <button
              onClick={() => setOpenDate(open ? null : day.date)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
            >
              <span className="flex items-center gap-2">
                <ChevronDown size={16} className={`text-fg-subtle transition-transform ${open ? "" : "-rotate-90"}`} />
                <span className="font-semibold">{weekday} {formatYmd(day.date)}</span>
              </span>
              <span className="text-xs text-fg-subtle">{day.items.length} 题</span>
            </button>
            {open ? (
              <ul className="divide-y divide-line border-t border-line">
                {day.items.map((entry, index) => (
                  <li key={index} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={difficultyClass[entry.difficulty as keyof typeof difficultyClass]}>
                        {difficultyCn[entry.difficulty as keyof typeof difficultyCn]}
                      </Badge>
                      <span className="font-mono text-xs text-fg-subtle">#{entry.frontendId}</span>
                      <a href={`/problems/${entry.problemId}`} className="font-medium hover:text-blue-600 dark:hover:text-blue-400">
                        {entry.titleCn}
                      </a>
                      <span className="text-xs text-fg-subtle">{kindLabel[entry.kind as keyof typeof kindLabel]}</span>
                      {typeof entry.feelingScore === "number" ? (
                        <span className="text-xs text-fg-subtle">· 反馈 {entry.feelingScore}/5</span>
                      ) : null}
                    </div>
                    {entry.noteMarkdown ? (
                      <div className="mt-2 text-xs">
                        <div className="font-medium text-fg-muted">解题思路</div>
                        <div className="mt-1 whitespace-pre-wrap leading-5 text-fg-muted">{entry.noteMarkdown}</div>
                      </div>
                    ) : null}
                    {entry.noteSyntax ? (
                      <div className="mt-2 text-xs">
                        <div className="font-medium text-fg-muted">C++ 语法 / 知识点</div>
                        <div className="mt-1 whitespace-pre-wrap leading-5 text-fg-muted">{entry.noteSyntax}</div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DayPlanList({ items }: { items: DashboardData["weekPlans"][number]["items"] }) {
  const totalMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-fg-subtle">安排题目</span>
        <span className="text-fg-subtle">{items.length ? `${items.length} 题 · ${totalMinutes}m` : "未排"}</span>
      </div>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={item.problem.leetcodeCnUrl}
                target="_blank"
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted"
                title={item.problem.titleCn}
              >
                <span className="font-mono text-[11px] text-fg-subtle">#{item.problem.frontendId}</span>
                <span
                  className={`min-w-0 flex-1 truncate text-xs ${
                    item.isCompleted ? "text-fg-subtle line-through" : "text-fg"
                  }`}
                >
                  {item.problem.titleCn}
                </span>
                <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${difficultyClass[item.problem.difficulty]}`}>
                  {item.problem.difficulty === "EASY" ? "易" : item.problem.difficulty === "MEDIUM" ? "中" : "难"}
                </span>
                <span className="shrink-0 text-[10px] text-fg-subtle">{kindLabel[item.kind]}</span>
                {item.isCompleted ? <Check size={12} className="shrink-0 text-emerald-500" /> : null}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">点下方“保存时段并生成周计划”自动排题。</p>
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

const difficultyCn = { EASY: "简单", MEDIUM: "中等", HARD: "困难" };

function TopicsView({
  data,
  onToggleEnabled,
  onBulkToggle,
}: {
  data: DashboardData;
  onToggleEnabled: (problemId: string, isEnabled: boolean) => void;
  onBulkToggle: (problemIds: string[], isEnabled: boolean) => void;
}) {
  const [showScore, setShowScore] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const byId = new Map(data.problems.map((problem) => [problem.frontendId, problem]));
  const groups = TOPIC_GROUPS.map((group) => {
    const items = group.ids
      .map((frontendId) => byId.get(frontendId))
      .filter((problem): problem is DashboardData["problems"][number] => Boolean(problem));
    const enabledCount = items.filter((problem) => problem.isEnabled !== false).length;
    return { name: group.name, items, enabledCount, total: items.length, allExcluded: items.length > 0 && enabledCount === 0 };
  });
  // Active topics keep study-plan order; fully-excluded topics sink to the bottom.
  const sorted = groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => (a.group.allExcluded === b.group.allExcluded ? a.index - b.index : a.group.allExcluded ? 1 : -1))
    .map((entry) => entry.group);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-subtle">勾选「不刷」把题目或整类排除出刷题列表（不会删除，排除的题变浅显示，整类排除会折叠并沉到底部）。</p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" checked={showScore} onChange={(event) => setShowScore(event.target.checked)} />
          显示做题反馈平均分
        </label>
      </div>

      {sorted.map((group) => {
        const isCollapsed = collapsed[group.name] ?? group.allExcluded;
        const ids = group.items.map((problem) => problem.id);

        return (
          <div key={group.name} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-muted px-4 py-3">
              <button
                onClick={() => setCollapsed((current) => ({ ...current, [group.name]: !isCollapsed }))}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                <ChevronDown size={16} className={`shrink-0 text-fg-subtle transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                <span className="font-semibold">{group.name}</span>
                <span className="text-xs text-fg-subtle">{group.enabledCount}/{group.total} 刷</span>
              </button>
              <button
                onClick={() => onBulkToggle(ids, group.allExcluded)}
                className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium ${
                  group.allExcluded
                    ? "border-line-strong text-fg-muted hover:bg-muted"
                    : "border-line-strong text-fg-subtle hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                }`}
              >
                {group.allExcluded ? "恢复整类" : "整类不刷"}
              </button>
            </div>
            {isCollapsed ? null : (
              <ul>
                {group.items.map((problem) => {
                  const excluded = problem.isEnabled === false;
                  return (
                    <li
                      key={problem.id}
                      className={`flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 ${excluded ? "opacity-45" : ""}`}
                    >
                      {problem.isAccepted ? (
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                          <Check size={13} />
                        </span>
                      ) : (
                        <span className="h-5 w-5 shrink-0 rounded-full border border-line-strong" />
                      )}
                      <a
                        href={`/problems/${problem.id}`}
                        className={`min-w-0 flex-1 truncate font-medium hover:text-blue-600 dark:hover:text-blue-400 ${excluded ? "line-through" : ""}`}
                      >
                        <span className="mr-1 font-mono text-xs text-fg-subtle">#{problem.frontendId}</span>
                        {problem.titleCn}
                      </a>
                      {showScore ? (
                        <span className="shrink-0 text-xs text-fg-subtle">
                          均分 {problem.avgFeelingScore !== null ? problem.avgFeelingScore.toFixed(1) : "—"}
                        </span>
                      ) : null}
                      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${difficultyClass[problem.difficulty]}`}>
                        {difficultyCn[problem.difficulty]}
                      </span>
                      <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-fg-subtle" title="勾选 = 不刷这道题">
                        <input
                          type="checkbox"
                          checked={excluded}
                          onChange={(event) => onToggleEnabled(problem.id, !event.target.checked)}
                        />
                        不刷
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

function StatsView({ data }: { data: DashboardData; completion: number }) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const scored = data.problems
    .filter((problem) => problem.feelingSessionCount > 0 && problem.avgFeelingScore !== null)
    .sort((a, b) => {
      const diff = (a.avgFeelingScore ?? 0) - (b.avgFeelingScore ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });

  return (
    <div className="space-y-5">
      <Panel title="做题反馈分数（每题平均分）" action={`${scored.length} 题`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-fg-subtle">分数越高代表越不熟（0 = 一次 AC，5 = 没思路）。点按钮切换升/降序。</p>
          <button
            onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-line-strong px-2.5 text-xs font-medium text-fg hover:bg-muted"
          >
            <ArrowUpDown size={13} />
            按平均分{sortDir === "asc" ? "升序" : "降序"}
          </button>
        </div>
        {scored.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-subtle">
                  <th className="border-b border-line py-2 font-medium">题目</th>
                  <th className="border-b border-line py-2 font-medium">难度</th>
                  <th className="border-b border-line py-2 font-medium">平均分</th>
                  <th className="border-b border-line py-2 font-medium">做题次数</th>
                </tr>
              </thead>
              <tbody>
                {scored.map((problem) => (
                  <tr key={problem.id}>
                    <td className="border-b border-line py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-fg-subtle">#{problem.frontendId}</span>
                        <a href={`/problems/${problem.id}`} className="font-medium hover:text-blue-400">
                          {problem.titleCn}
                        </a>
                      </div>
                    </td>
                    <td className="border-b border-line py-2.5">
                      <Badge className={difficultyClass[problem.difficulty]}>{problem.difficulty}</Badge>
                    </td>
                    <td className="border-b border-line py-2.5">{scorePill(problem.avgFeelingScore ?? 0)}</td>
                    <td className="border-b border-line py-2.5 text-fg-muted">{problem.feelingSessionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="还没有带评分的做题记录。在今日任务里完成题目并打分后会出现在这里。" />
        )}
      </Panel>
    </div>
  );
}

function scorePill(score: number) {
  const tone =
    score < 1.5
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      : score < 3
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300";
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
          className="min-h-36 w-full resize-y rounded-md border border-line-strong p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
        />
        <button
          onClick={syncLeetCode}
          disabled={Boolean(busy)}
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-btn-strong"
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
    </div>
  );
}

const feelingLabels = ["一次 AC", "基本顺利", "小错误", "卡了一会", "靠提示", "没思路"];
const feelingDefaultDays = [7, 5, 3, 2, 1, 1];

function TaskRow({
  item,
  onMark,
  onRemove,
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
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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
    setFeedbackOpen(false);
  }

  const history = item.history ?? [];

  return (
    <div>
      <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="min-w-0 lg:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={difficultyClass[item.problem.difficulty]}>{difficultyCn[item.problem.difficulty]}</Badge>
            <span className="font-mono text-xs text-fg-subtle">#{item.problem.frontendId}</span>
            <a href={item.problem.leetcodeCnUrl} target="_blank" className="font-medium text-fg break-words hover:text-blue-400">
              {item.problem.titleCn}
            </a>
            <span className="text-xs text-fg-subtle">{kindLabel[item.kind]}</span>
            <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
              <BarChart3 size={13} /> 反馈均分 {(item.problem.avgFeelingScore ?? 5).toFixed(1)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:w-[320px] lg:shrink-0">
          <a
            href={item.problem.leetcodeCnUrl}
            target="_blank"
            className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-line-strong px-2 text-sm font-medium text-fg hover:bg-muted"
          >
            <ExternalLink size={14} />
            打开力扣
          </a>
          {item.isCompleted ? (
            <>
              <span className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                <Check size={14} /> 已完成
              </span>
              <button
                onClick={() => setFeedbackOpen((open) => !open)}
                className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-line-strong px-2 text-sm font-medium text-fg hover:bg-muted"
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
                className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md bg-btn-strong px-2 text-sm font-semibold text-white hover:opacity-90"
              >
                <Check size={14} />
                待完成
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-line-strong px-2 text-sm font-medium text-fg-subtle hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/15 dark:hover:text-red-400"
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
        <div className="border-t border-line bg-muted px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-fg">做题感觉{item.isCompleted ? "（编辑）" : ""}</div>
              <div className="mt-1 text-xs text-fg-subtle">0 表示一次 AC，5 表示完全没思路。</div>
            </div>
            <button
              onClick={() => setFeedbackOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-surface"
              title="关闭"
            >
              <X size={15} />
            </button>
          </div>
          {history.length ? (
            <div className="mt-3 rounded-md border border-line bg-surface">
              <button
                onClick={() => setHistoryOpen((open) => !open)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-fg-muted"
              >
                <ChevronDown size={14} className={`transition-transform ${historyOpen ? "" : "-rotate-90"}`} />
                以前做这道题的笔记（{history.length} 次）
              </button>
              {historyOpen ? (
                <div className="space-y-2 px-3 pb-3">
                  {history.map((entry, index) => (
                    <div key={index} className="rounded-md border border-line bg-muted p-3 text-xs">
                      <div className="flex items-center gap-2 text-fg-subtle">
                        <span>{entry.completedAt.slice(0, 10)}</span>
                        {typeof entry.feelingScore === "number" ? <span>· 反馈 {entry.feelingScore}/5</span> : null}
                      </div>
                      {entry.noteMarkdown ? (
                        <div className="mt-2">
                          <div className="font-medium text-fg-muted">解题思路</div>
                          <div className="mt-1 whitespace-pre-wrap leading-5 text-fg-muted">{entry.noteMarkdown}</div>
                        </div>
                      ) : null}
                      {entry.noteSyntax ? (
                        <div className="mt-2">
                          <div className="font-medium text-fg-muted">C++ 语法 / 知识点</div>
                          <div className="mt-1 whitespace-pre-wrap leading-5 text-fg-muted">{entry.noteSyntax}</div>
                        </div>
                      ) : null}
                      {!entry.noteMarkdown && !entry.noteSyntax ? (
                        <p className="mt-1 text-fg-subtle">这次没有写笔记。</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 grid grid-cols-6 gap-2">
            {feelingLabels.map((label, score) => (
              <button
                key={label}
                onClick={() => chooseScore(score)}
                className={`rounded-md border px-2 py-2 text-center text-xs transition ${
                  feelingScore === score
                    ? "border-blue-500 bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-line bg-surface text-fg-muted hover:border-line-strong"
                }`}
              >
                <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs">
                  {score}
                </span>
                {label}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
            几天后复习
            <input
              type="number"
              min={1}
              max={60}
              value={reviewAfterDays}
              onChange={(event) => setReviewAfterDays(Math.max(1, Number(event.target.value) || 1))}
              className="h-9 w-20 rounded-md border border-line-strong px-2 text-sm"
            />
          </label>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1 font-medium text-fg">
                <BookOpen size={14} /> 解题思路笔记
              </span>
              <textarea
                value={noteMarkdown}
                onChange={(event) => setNoteMarkdown(event.target.value)}
                placeholder="这道题的思路、卡点、错因、下次复习要注意的点（支持 Markdown）"
                className="mt-2 min-h-[28rem] w-full resize-y rounded-md border border-line-strong bg-surface p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1 font-medium text-fg">
                <Code2 size={14} /> C++ 语法 / 知识点
              </span>
              <textarea
                value={noteSyntax}
                onChange={(event) => setNoteSyntax(event.target.value)}
                placeholder="C++ 语法、STL 成员函数用法、容器/迭代器等基础知识点，方便后续整理复习"
                className="mt-2 min-h-[28rem] w-full resize-y rounded-md border border-line-strong bg-surface p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              onClick={submitFeedback}
              disabled={feelingScore === null}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-btn-strong"
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
          <tr className="text-left text-xs text-fg-subtle">
            <th className="border-b border-line py-2 font-medium">题目</th>
            <th className="border-b border-line py-2 font-medium">难度</th>
            <th className="border-b border-line py-2 font-medium">提交</th>
            <th className="border-b border-line py-2 font-medium">AC</th>
            <th className="border-b border-line py-2 font-medium">正确率</th>
            <th className="border-b border-line py-2 font-medium">笔记</th>
            <th className="border-b border-line py-2 font-medium">代码</th>
            <th className="border-b border-line py-2 font-medium">最近 AC</th>
            <th className="border-b border-line py-2 font-medium">复习风险</th>
            <th className="border-b border-line py-2 font-medium">下次复习</th>
            <th className="border-b border-line py-2 font-medium">标签</th>
            <th className="border-b border-line py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((problem) => {
            const disabled = problem.isEnabled === false;

            return (
            <tr key={problem.id} className={disabled ? "opacity-50" : undefined}>
              <td className="border-b border-line py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-fg-subtle">#{problem.frontendId}</span>
                  <a href={`/problems/${problem.id}`} className="font-medium hover:text-blue-400">
                    {problem.titleCn}
                  </a>
                  <a href={problem.leetcodeCnUrl} target="_blank" className="text-fg-subtle hover:text-blue-400" title="打开力扣">
                    <ExternalLink size={13} />
                  </a>
                  {disabled ? (
                    <span className="inline-flex rounded border border-line bg-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle">已移除</span>
                  ) : null}
                </div>
              </td>
              <td className="border-b border-line py-3"><Badge className={difficultyClass[problem.difficulty]}>{problem.difficulty}</Badge></td>
              <td className="border-b border-line py-3"><IconMetric icon={RefreshCw} value={problem.totalSubmissions} /></td>
              <td className="border-b border-line py-3"><IconMetric icon={Check} value={problem.acceptedSubmissions} /></td>
              <td className="border-b border-line py-3">{ratePill(problem.acceptedRate)}</td>
              <td className="border-b border-line py-3"><IconMetric icon={FileText} value={problem.noteCount} /></td>
              <td className="border-b border-line py-3"><IconMetric icon={Code2} value={problem.codeCount} /></td>
              <td className="border-b border-line py-3 text-fg-muted">{formatYmd(problem.lastAcceptedAt)}</td>
              <td className="border-b border-line py-3">{riskPill(problem.reviewRiskScore)}</td>
              <td className="border-b border-line py-3 text-fg-muted">{formatYmd(problem.nextReviewDate)}</td>
              <td className="border-b border-line py-3 text-xs text-fg-subtle">{problem.tags.split(",").slice(0, 3).join(" / ")}</td>
              <td className="border-b border-line py-3">
                {disabled ? (
                  <button
                    onClick={() => onToggleEnabled(problem.id, true)}
                    className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-line-strong px-2 text-xs font-medium text-fg-muted hover:bg-muted"
                    title="恢复复习这道题"
                  >
                    <RefreshCw size={13} /> 恢复
                  </button>
                ) : (
                  <button
                    onClick={() => onToggleEnabled(problem.id, false)}
                    className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-md border border-line px-2 text-xs font-medium text-fg-subtle hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:bg-red-500/15 dark:hover:text-red-400"
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

function MetricGrid({ data }: { data: DashboardData; completion: number }) {
  const todayCount = data.todayPlan?.items.length ?? 0;
  const todayDone = data.todayPlan?.items.filter((item) => item.isCompleted).length ?? 0;
  const weekTarget = data.weekPlans.reduce((sum, plan) => sum + plan.items.length, 0);
  const weekDone = data.weekPlans.reduce(
    (sum, plan) => sum + plan.items.filter((item) => item.isCompleted).length,
    0,
  );
  const weekPct = weekTarget ? Math.round((weekDone / weekTarget) * 100) : 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="本周进度" value={`${weekDone}/${weekTarget}`} hint={`${weekPct}% · 本周目标题数`} />
      <Metric label="做题记录" value={`${data.stats.sessions}`} hint="累计 session" />
      <Metric label="今日题量" value={`${todayDone}/${todayCount}`} hint="已处理 / 今日题数" />
    </div>
  );
}


function Metric({ label, value, hint, tone = "default" }: { label: string; value: string; hint: string; tone?: "default" | "warning" }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-fg-subtle">
        {tone === "warning" ? <Clock3 size={14} className="text-amber-600" /> : null}
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <span className="text-xs text-fg-subtle">{hint}</span>
      </div>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action ? <span className="text-xs text-fg-subtle">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>;
}

function IconMetric({ icon: Icon, value }: { icon: typeof RefreshCw; value: number }) {
  return <span className="inline-flex items-center gap-1 text-fg"><Icon size={14} /> {value}</span>;
}

function ratePill(rate: number) {
  const tone =
    rate === 0
      ? "bg-muted text-fg-subtle"
      : rate < 50
        ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
        : rate < 75
          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>{rate}%</span>;
}

function riskPill(score: number) {
  const tone =
    score >= 70
      ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300"
      : score >= 40
        ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
        : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${tone}`}><AlertTriangle size={13} /> {score}</span>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-line-strong bg-muted text-sm text-fg-subtle">
      {text}
    </div>
  );
}
