"use client";

import {
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Code2,
  DatabaseZap,
  ExternalLink,
  ListChecks,
  LogOut,
  Moon,
  NotebookPen,
  PanelLeft,
  Plus,
  RefreshCw,
  Settings2,
  Sun,
  Target,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";
import { TOPIC_GROUPS } from "@/lib/topics";

type ActiveView = "today" | "weekly" | "history" | "reviews" | "stats" | "sync";
type WeekDay = DashboardData["availability"][number];
type WeekPlans = DashboardData["weekPlans"];

const navItems: { href: string; key: ActiveView; label: string; icon: typeof Target }[] = [
  { href: "/today", key: "today", label: "今日任务", icon: Target },
  { href: "/weekly", key: "weekly", label: "周计划", icon: CalendarDays },
  { href: "/history", key: "history", label: "历史笔记", icon: NotebookPen },
  { href: "/reviews", key: "reviews", label: "刷题计划", icon: ListChecks },
  { href: "/stats", key: "stats", label: "统计", icon: DatabaseZap },
  { href: "/settings/sync", key: "sync", label: "力扣同步", icon: Settings2 },
];

const viewTitle: Record<ActiveView, { title: string; subtitle: string }> = {
  today: { title: "今日任务", subtitle: "只看今天要处理的题目，打开力扣后做题，完成后标记已处理即可。" },
  weekly: { title: "周计划", subtitle: "设置每天要完成的题量，系统按艾宾浩斯遗忘曲线实时排题。" },
  history: { title: "历史笔记", subtitle: "按天回顾做过的题、当时的反馈分数和笔记（解题思路 / C++ 语法分两栏）。" },
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
const APP_VERSION = "v1.2.2";
const APP_UPDATED = "2026-07-01";
const DEFAULT_DAILY_COUNT = 3;

function handleNoteTab(
  event: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  setValue: (next: string) => void,
) {
  if (event.key !== "Tab") {
    return;
  }
  event.preventDefault();
  const textarea = event.currentTarget;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const indent = "    ";

  if (event.shiftKey) {
    // Dedent: drop up to 4 spaces just before the cursor.
    const before = value.slice(0, start);
    const removed = before.match(/ {1,4}$/)?.[0] ?? "";
    if (!removed) {
      return;
    }
    const next = value.slice(0, start - removed.length) + value.slice(start);
    setValue(next);
    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start - removed.length;
    });
    return;
  }

  const next = value.slice(0, start) + indent + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    textarea.selectionStart = textarea.selectionEnd = start + indent.length;
  });
}

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

  // Push a single problem to the next day (skip Sunday) without reshuffling.
  async function deferItem(id: string) {
    setBusy(`/api/plan-items/${id}/defer`);
    setMessage("");
    const response = await fetch(`/api/plan-items/${id}/defer`, { method: "POST" });
    setBusy("");
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(payload.error ?? "操作失败");
      return null;
    }
    const payload = (await response.json()) as { weekPlans: DashboardData["weekPlans"] };
    return payload.weekPlans;
  }

  // Append one more problem to a day's plan without reshuffling the week.
  async function addOneToDay(date: string) {
    setBusy("/api/plans/add-one");
    setMessage("");
    const response = await fetch("/api/plans/add-one", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setBusy("");
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(payload.error ?? "追加失败");
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
              completion={completion}
            />
          ) : null}
          {active === "weekly" ? (
            <WeeklyView
              days={data.availability}
              initialPlans={data.weekPlans}
              history={data.weekHistory}
              onGenerate={generateWeekly}
              onAddOne={addOneToDay}
              onDefer={deferItem}
              busy={Boolean(busy)}
            />
          ) : null}
          {active === "history" ? <HistoryView data={data} /> : null}
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
  completion: number;
}) {
  const items = data.todayPlan?.items ?? [];
  const dateKey = data.todayPlan?.date ?? data.today;
  const dateLabel = `${weekdayLabels[new Date(`${dateKey}T00:00:00Z`).getUTCDay()]} ${formatYmd(dateKey)}`;

  return (
    <div className="space-y-5">
      <TodayOverview data={data} />
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
          <span className="absolute right-4 text-sm text-fg-subtle">
            {data.todayPlan || data.todayExtra.length ? `${items.length + data.todayExtra.length} 题` : "未生成"}
          </span>
        </div>
        {items.length || data.todayExtra.length ? (
          <div className="divide-y divide-line">
            {items.map((item) => (
              <TaskRow key={item.id} item={item} onMark={onMark} />
            ))}
            {data.todayExtra.map((extra) => (
              <ExtraDoneRow key={extra.problemId} extra={extra} />
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

// A problem studied today that is no longer in today's plan (e.g. a re-plan
// dropped it). Read-only — its notes live on the problem detail page.
function ExtraDoneRow({ extra }: { extra: DashboardData["todayExtra"][number] }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${difficultyClass[extra.difficulty as keyof typeof difficultyClass]}`}>
        {difficultyCn[extra.difficulty as keyof typeof difficultyCn]}
      </span>
      <a href={`/problems/${extra.problemId}`} className="min-w-0 flex-1 truncate font-medium hover:text-blue-600 dark:hover:text-blue-400">
        <span className="mr-1 font-mono text-xs text-fg-subtle">#{extra.frontendId}</span>
        {extra.titleCn}
      </a>
      <span className="shrink-0 text-xs text-fg-subtle">{kindLabel[extra.kind as keyof typeof kindLabel]}</span>
      {typeof extra.feelingScore === "number" ? (
        <span className="shrink-0 text-xs text-fg-subtle">反馈 {extra.feelingScore}/5</span>
      ) : null}
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
        <Check size={13} /> 已完成
      </span>
    </div>
  );
}

function WeeklyView({
  days,
  initialPlans,
  history,
  onGenerate,
  onAddOne,
  onDefer,
  busy,
}: {
  days: WeekDay[];
  initialPlans: WeekPlans;
  history: DashboardData["weekHistory"];
  onGenerate: (counts: Record<string, number>) => Promise<WeekPlans | null>;
  onAddOne: (date: string) => Promise<WeekPlans | null>;
  onDefer: (id: string) => Promise<WeekPlans | null>;
  busy: boolean;
}) {
  const [plans, setPlans] = useState(initialPlans);
  const plansByDate = new Map(plans.map((plan) => [plan.date, plan.items]));
  const todayKey = days[0]?.date ?? "";
  const pastDays = history.filter((day) => day.date < todayKey);

  async function addOne(date: string) {
    const result = await onAddOne(date);
    if (result) {
      setPlans(result);
    }
  }

  async function defer(id: string) {
    const result = await onDefer(id);
    if (result) {
      setPlans(result);
    }
  }

  // Deliberate full re-plan of the week, keeping each day's current size (blank
  // non-Sunday days default to DEFAULT_DAILY_COUNT so they get seeded).
  async function regenerate() {
    const counts: Record<string, number> = {};
    for (const day of days) {
      const len = plansByDate.get(day.date)?.length ?? 0;
      counts[day.date] = day.weekday === 0 ? 0 : len > 0 ? len : DEFAULT_DAILY_COUNT;
    }
    const result = await onGenerate(counts);
    if (result) {
      setPlans(result);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-subtle">
          按艾宾浩斯遗忘曲线排题（到期/逾期复习优先，其次新题）。周日休息不排题；点某题的「往后排」可把它顺延到下一天。
        </p>
        <button
          onClick={regenerate}
          disabled={busy}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-xs font-medium text-fg-muted hover:bg-muted disabled:opacity-40"
          title="按当前每天题量重新排整周（会打乱已排的题）"
        >
          <RefreshCw size={13} />
          重排本周
        </button>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {days.map((day) => {
          const isSunday = day.weekday === 0;
          const items = plansByDate.get(day.date) ?? [];
          return (
            <div key={day.date} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{weekdayLabels[day.weekday]}</span>
                  <span className="text-xs text-fg-subtle">{formatYmd(day.date)}</span>
                </div>
                {isSunday ? (
                  <span className="text-xs text-fg-subtle">休息日</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{items.length}</span>
                    <button
                      onClick={() => addOne(day.date)}
                      disabled={busy || items.length >= 30}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-muted disabled:opacity-40"
                      title="追加一题（不打乱已排的题）"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
              {isSunday ? (
                <p className="mt-3 border-t border-line pt-3 text-xs text-fg-subtle">周日休息，不安排题目。</p>
              ) : (
                <DayPlanList items={items} onDefer={defer} busy={busy} />
              )}
            </div>
          );
        })}
        {pastDays.map((day) => {
          const weekday = weekdayLabels[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
          return (
            <div key={day.date} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{weekday}</span>
                  <span className="text-xs text-fg-subtle">{formatYmd(day.date)}</span>
                </div>
                <span className="text-xs text-fg-subtle">已做 {day.items.length}</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {day.items.map((entry, index) => (
                  <li key={index}>
                    <a
                      href={`/problems/${entry.problemId}`}
                      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted"
                      title="查看这道题的历史笔记"
                    >
                      <span className="font-mono text-[11px] text-fg-subtle">#{entry.frontendId}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-fg">{entry.titleCn}</span>
                      {typeof entry.feelingScore === "number" ? (
                        <span className="shrink-0 text-[10px] text-fg-subtle">{entry.feelingScore}/5</span>
                      ) : null}
                      <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${difficultyClass[entry.difficulty as keyof typeof difficultyClass]}`}>
                        {difficultyCn[entry.difficulty as keyof typeof difficultyCn]}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HistoryView({ data }: { data: DashboardData }) {
  const history = data.weekHistory;

  if (!history.length) {
    return (
      <EmptyState text="还没有做题记录。在今日任务里完成题目并提交反馈后，会按天出现在这里。" />
    );
  }

  return (
    <div className="space-y-5">
      {history.map((day) => {
        const weekday = weekdayLabels[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
        return (
          <div key={day.date}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">{weekday} {formatYmd(day.date)}</h2>
              <span className="text-xs text-fg-subtle">{day.items.length} 题</span>
            </div>
            <div className="space-y-2">
              {day.items.map((entry, index) => (
                <HistoryEntry key={index} entry={entry} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryEntry({ entry }: { entry: DashboardData["weekHistory"][number]["items"][number] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronDown size={16} className={`shrink-0 text-fg-subtle transition-transform ${open ? "" : "-rotate-90"}`} />
        <Badge className={difficultyClass[entry.difficulty as keyof typeof difficultyClass]}>
          {difficultyCn[entry.difficulty as keyof typeof difficultyCn]}
        </Badge>
        <span className="font-mono text-xs text-fg-subtle">#{entry.frontendId}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{entry.titleCn}</span>
        <span className="shrink-0 text-xs text-fg-subtle">{kindLabel[entry.kind as keyof typeof kindLabel]}</span>
        {typeof entry.feelingScore === "number" ? (
          <span className="shrink-0 text-xs text-fg-subtle">反馈 {entry.feelingScore}/5</span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-line px-4 py-3">
          <div className="mb-3">
            <a
              href={`/problems/${entry.problemId}`}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              查看这道题的完整历史 →
            </a>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-1 text-sm font-medium text-fg">
                <BookOpen size={14} /> 解题思路
              </div>
              <div className="mt-1.5 min-h-16 whitespace-pre-wrap rounded-md border border-line bg-muted p-3 font-mono text-sm leading-6 text-fg-muted">
                {entry.noteMarkdown || "—"}
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-sm font-medium text-fg">
                <Code2 size={14} /> C++ 语法 / 知识点
              </div>
              <div className="mt-1.5 min-h-16 whitespace-pre-wrap rounded-md border border-line bg-muted p-3 font-mono text-sm leading-6 text-fg-muted">
                {entry.noteSyntax || "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DayPlanList({
  items,
  onDefer,
  busy,
}: {
  items: DashboardData["weekPlans"][number]["items"];
  onDefer: (id: string) => void;
  busy: boolean;
}) {
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
            <li key={item.id} className="flex items-center gap-1">
              <a
                href={`/problems/${item.problem.id}`}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted"
                title="查看这道题的历史笔记"
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
              {item.isCompleted ? null : (
                <button
                  onClick={() => onDefer(item.id)}
                  disabled={busy}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line text-fg-subtle hover:bg-muted disabled:opacity-40"
                  title="往后排一天（今天不做这题）"
                >
                  <ArrowRight size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">点右上角「+」追加一题，或用「重排本周」自动排题。</p>
      )}
    </div>
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

const feelingLabels = ["AC（快）", "AC（慢）", "无提示 AC", "提交错误", "思路不清晰", "陌生"];
const feelingDefaultDays = [7, 5, 3, 2, 1, 1];

function TaskRow({
  item,
  onMark,
}: {
  item: NonNullable<DashboardData["todayPlan"]>["items"][number];
  onMark: (
    id: string,
    feelingScore: number,
    reviewAfterDays?: number,
    noteMarkdown?: string,
    noteSyntax?: string,
  ) => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [feelingScore, setFeelingScore] = useState<number | null>(item.session?.feelingScore ?? null);
  const [reviewAfterDays, setReviewAfterDays] = useState(item.session?.reviewAfterDays ?? 7);
  const [noteMarkdown, setNoteMarkdown] = useState(item.session?.noteMarkdown ?? "");
  const [noteSyntax, setNoteSyntax] = useState(item.session?.noteSyntax ?? "");
  const past = item.history ?? [];

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
        <div className="grid grid-cols-2 gap-2 lg:w-[260px] lg:shrink-0">
          <button
            onClick={() => setFeedbackOpen((open) => !open)}
            title="点开填写或编辑做题反馈"
            className={`inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium ${
              item.isCompleted
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-btn-strong text-white hover:opacity-90"
            }`}
          >
            {item.isCompleted ? "已完成" : "待完成"}
          </button>
          <a
            href={item.problem.leetcodeCnUrl}
            target="_blank"
            className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-line-strong px-2 text-sm font-medium text-fg hover:bg-muted"
          >
            <ExternalLink size={14} />
            去刷题
          </a>
        </div>
      </div>
      {feedbackOpen ? (
        <div className="border-t border-line bg-muted px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-fg">做题感觉{item.isCompleted ? "（编辑）" : ""}</div>
              <div className="mt-1 text-xs text-fg-subtle">0 表示一次 AC，5 表示完全没思路。</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={submitFeedback}
                disabled={feelingScore === null}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-btn-strong"
              >
                <Check size={15} />
                {item.isCompleted ? "更新反馈" : "提交反馈"}
              </button>
              <button
                onClick={() => setFeedbackOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle hover:bg-surface"
                title="关闭"
              >
                <X size={15} />
              </button>
            </div>
          </div>
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
                onKeyDown={(event) => handleNoteTab(event, noteMarkdown, setNoteMarkdown)}
                spellCheck={false}
                placeholder="这道题的思路、卡点、错因、下次复习要注意的点（支持 Markdown，Tab 缩进）"
                className="mt-2 min-h-[28rem] w-full resize-y rounded-md border border-line-strong bg-surface p-3 font-mono text-[15px] leading-7 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
            <label className="text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1 font-medium text-fg">
                <Code2 size={14} /> C++ 语法 / 知识点
              </span>
              <textarea
                value={noteSyntax}
                onChange={(event) => setNoteSyntax(event.target.value)}
                onKeyDown={(event) => handleNoteTab(event, noteSyntax, setNoteSyntax)}
                spellCheck={false}
                placeholder="C++ 语法、STL 成员函数用法、容器/迭代器等基础知识点（Tab 缩进）"
                className="mt-2 min-h-[28rem] w-full resize-y rounded-md border border-line-strong bg-surface p-3 font-mono text-[15px] leading-7 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </label>
          </div>
          {past.length ? (
            <div className="mt-3 rounded-md border border-line bg-surface">
              <button
                onClick={() => setPastOpen((open) => !open)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-fg-muted"
              >
                <ChevronDown size={14} className={`transition-transform ${pastOpen ? "" : "-rotate-90"}`} />
                以前做这道题的笔记（{past.length} 次 · 只读，仅供参考）
              </button>
              {pastOpen ? (
                <div className="space-y-2 px-3 pb-3">
                  {past.map((entry, index) => (
                    <div key={index} className="rounded-md border border-line bg-muted p-3 text-xs">
                      <div className="flex items-center gap-2 text-fg-subtle">
                        <span>{entry.completedAt.slice(0, 10)}</span>
                        {typeof entry.feelingScore === "number" ? <span>· 反馈 {entry.feelingScore}/5</span> : null}
                      </div>
                      {entry.noteMarkdown ? (
                        <div className="mt-2">
                          <div className="font-medium text-fg-muted">解题思路</div>
                          <div className="mt-1 whitespace-pre-wrap font-mono leading-5 text-fg-muted">{entry.noteMarkdown}</div>
                        </div>
                      ) : null}
                      {entry.noteSyntax ? (
                        <div className="mt-2">
                          <div className="font-medium text-fg-muted">C++ 语法 / 知识点</div>
                          <div className="mt-1 whitespace-pre-wrap font-mono leading-5 text-fg-muted">{entry.noteSyntax}</div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function heatLevelClass(count: number, future: boolean) {
  if (future) return "bg-transparent";
  if (count <= 0) return "bg-muted";
  if (count <= 1) return "bg-emerald-500/30";
  if (count <= 3) return "bg-emerald-500/55";
  if (count <= 5) return "bg-emerald-500/80";
  return "bg-emerald-500";
}

// Today overview: key metrics plus a GitHub-style contribution heatmap of daily
// study counts, all in one card. Heatmap columns are weeks (Monday top → Sunday
// bottom); darker green = more problems studied that day.
function TodayOverview({ data }: { data: DashboardData }) {
  const heatmap = data.heatmap;
  const weekTarget = data.weekProgress.target;
  const weekDone = data.weekProgress.done;
  const weekPct = weekTarget ? Math.round((weekDone / weekTarget) * 100) : 0;
  const extraDone = data.todayExtra.length;
  const todayCount = (data.todayPlan?.items.length ?? 0) + extraDone;
  const todayDone = (data.todayPlan?.items.filter((item) => item.isCompleted).length ?? 0) + extraDone;

  const start = new Date(`${heatmap.start}T00:00:00Z`);
  const columns = Array.from({ length: heatmap.weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, r) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + w * 7 + r);
      const key = date.toISOString().slice(0, 10);
      return {
        key,
        count: heatmap.counts[key] ?? 0,
        future: key > heatmap.today,
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      };
    }),
  );
  const monthLabels = columns.map((col, index) => {
    const month = col[0].month;
    const prev = index > 0 ? columns[index - 1][0].month : -1;
    return month !== prev ? `${month}月` : "";
  });

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <OverviewStat label="本周进度" value={`${weekDone}/${weekTarget}`} hint={`${weekPct}% · 本周目标`} />
        <OverviewStat label="今日题量" value={`${todayDone}/${todayCount}`} hint="已处理 / 今日题数" />
        <OverviewStat label="累计完成" value={`${heatmap.total}`} />
        <OverviewStat label="本月完成" value={`${heatmap.month}`} />
        <OverviewStat label="本周完成" value={`${heatmap.week}`} />
      </div>
      <div className="mt-5 border-t border-line pt-5">
        <div className="mx-auto w-max max-w-full overflow-x-auto overflow-y-hidden">
          <div className="flex gap-1.5">
            {columns.map((col, index) => (
              <div key={index} className="flex flex-col gap-1.5">
                {col.map((cell) => (
                  <div
                    key={cell.key}
                    title={cell.future ? undefined : `${cell.month}月${cell.day}日 · ${cell.count} 题`}
                    className={`h-5 w-5 rounded-sm ${heatLevelClass(cell.count, cell.future)}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {monthLabels.map((label, index) => (
              <div key={index} className="w-5 whitespace-nowrap text-[10px] leading-none text-fg-subtle">
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OverviewStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-fg-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-fg-subtle">{hint}</div> : null}
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
