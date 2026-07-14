"use client";

import {
  ArrowUpDown,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Code2,
  DatabaseZap,
  ExternalLink,
  GripVertical,
  ListChecks,
  LogOut,
  Moon,
  NotebookPen,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Target,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type DragEvent, useEffect, useRef, useState, useTransition } from "react";
import type { DashboardData } from "@/lib/dashboard-data";
import { noteToHtml, noteToPlainText } from "@/lib/notes";
import { defaultReviewDays, type FeelingScore } from "@/lib/review-scheduler";
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
  weekly: { title: "周计划", subtitle: "" },
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
const kindClass = {
  NEW: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300",
  REVIEW: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  RETEST: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/15 dark:text-purple-300",
};
const kindTextClass = {
  NEW: "text-blue-600 dark:text-blue-400",
  REVIEW: "text-amber-600 dark:text-amber-400",
  RETEST: "text-purple-600 dark:text-purple-400",
};
const APP_VERSION = "v1.12.1";
const APP_UPDATED = "2026-07-08";

// Monaco (the engine behind LeetCode's code editor) is heavy, so it loads on
// demand — only when a feedback panel actually opens.
const MonacoNoteEditor = dynamic(() => import("@/components/monaco-note-editor"), {
  ssr: false,
  loading: () => (
    <div className="mt-2 flex h-[28rem] items-center justify-center rounded-md border border-line-strong text-sm text-fg-subtle">
      编辑器加载中…
    </div>
  ),
});

// Read-only rendering of a stored note (rich HTML or legacy plain text).
function NoteContent({ value, className }: { value: string; className?: string }) {
  return (
    <div
      className={`note-content whitespace-pre-wrap font-mono ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: noteToHtml(value) }}
    />
  );
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

// Stale-while-revalidate over the long-lived client router cache: pages always
// render instantly from cache, and freshness happens in the background —
// (1) after any mutation every page re-fetches on its next visit, (2) arriving
// on a page whose data is older than REFRESH_AFTER_MS re-fetches it in place,
// (3) window focus refreshes the current page and re-warms the other tabs.
let lastMutationAt = 0;
let firstMount = true;
let lastWarmAt = 0;
const lastRefreshedAt: Record<string, number> = {};
const REFRESH_AFTER_MS = 60_000;

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
  const pathname = usePathname();
  const [isRefreshing, startRefresh] = useTransition();

  // Background freshness on arrival: the cached page shows instantly; if its
  // data predates the last mutation, is of unknown age (first consumption of a
  // prefetched entry), or is older than REFRESH_AFTER_MS, re-fetch in place.
  // The very first render of a session is the SSR response — fresh by
  // definition — so it's only stamped.
  useEffect(() => {
    const now = Date.now();
    const stamp = lastRefreshedAt[pathname] ?? 0;
    if (firstMount) {
      firstMount = false;
      lastRefreshedAt[pathname] = now;
      return;
    }
    if (stamp === 0 || lastMutationAt > stamp || now - stamp > REFRESH_AFTER_MS) {
      lastRefreshedAt[pathname] = now;
      router.refresh();
    }
  }, [pathname, router]);

  // Returning to the tab (e.g. after solving on LeetCode): refresh the current
  // view and re-warm the other tabs' prefetch entries so even a long-idle
  // session never falls back to the loading screen. Throttled to 2 min.
  useEffect(() => {
    function warm() {
      const now = Date.now();
      if (document.hidden || now - lastWarmAt < 120_000) {
        return;
      }
      lastWarmAt = now;
      if (now - (lastRefreshedAt[pathname] ?? 0) > 30_000) {
        lastRefreshedAt[pathname] = now;
        router.refresh();
      }
      for (const item of navItems) {
        if (item.href !== pathname) {
          router.prefetch(item.href);
        }
      }
    }
    window.addEventListener("focus", warm);
    document.addEventListener("visibilitychange", warm);
    return () => {
      window.removeEventListener("focus", warm);
      document.removeEventListener("visibilitychange", warm);
    };
  }, [pathname, router]);

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

    lastMutationAt = Date.now();
    return true;
  }

  // Send one instruction to the plan assistant (DeepSeek-backed), with the
  // recent chat tail for conversational context. Returns the assistant's reply
  // and, when it changed anything, the fresh week plans.
  async function askAssistant(
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ) {
    setBusy("/api/assistant");
    setMessage("");
    const response = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, history }),
    });
    setBusy("");
    const payload = (await response.json().catch(() => ({}))) as {
      reply?: string;
      weekPlans?: DashboardData["weekPlans"];
      error?: string;
    };
    if (!response.ok) {
      return { reply: payload.error ?? "助手暂时不可用", weekPlans: null };
    }
    lastMutationAt = Date.now();
    return { reply: payload.reply ?? "已处理。", weekPlans: payload.weekPlans ?? null };
  }

  // Toggle a category's priority flag (刷题计划 page). Priority categories get
  // one new problem each per day when scheduling.
  async function togglePriorityCategory(name: string) {
    const current = data.planSettings.priorityCategories;
    const next = current.includes(name)
      ? current.filter((item) => item !== name)
      : [...current, name];
    const ok = await requestJson("/api/settings", { priorityCategories: next }, "POST");
    if (ok) router.refresh();
  }

  // Move a single problem to a specific day (drag-and-drop) without reshuffling.
  async function moveItem(id: string, date: string) {
    setBusy(`/api/plan-items/${id}/move`);
    setMessage("");
    const response = await fetch(`/api/plan-items/${id}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setBusy("");
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(payload.error ?? "移动失败");
      return null;
    }
    lastMutationAt = Date.now();
    const payload = (await response.json()) as { weekPlans: DashboardData["weekPlans"] };
    return payload.weekPlans;
  }

  // Add a specific problem to a specific day (drag a search result onto a day).
  async function addProblemToDay(date: string, problemId: string) {
    setBusy("/api/plans/add-problem");
    setMessage("");
    const response = await fetch("/api/plans/add-problem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, problemId }),
    });
    setBusy("");
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setMessage(payload.error ?? "添加失败");
      return null;
    }
    lastMutationAt = Date.now();
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
              <Link
                key={item.key}
                href={item.href}
                prefetch={true}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm transition ${
                  selected
                    ? "bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "text-fg-muted hover:bg-muted hover:text-fg"
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
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
                {viewTitle[active].subtitle ? (
                  <p className="mt-1 text-sm text-fg-subtle">{viewTitle[active].subtitle}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  lastRefreshedAt[pathname] = Date.now();
                  startRefresh(() => router.refresh());
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-fg-muted hover:bg-muted"
                title="手动刷新当前页数据"
              >
                <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              </button>
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
              problems={data.problems}
              today={data.today}
              onMove={moveItem}
              onAddProblem={addProblemToDay}
              onAsk={askAssistant}
              busy={Boolean(busy)}
            />
          ) : null}
          {active === "history" ? <HistoryView data={data} /> : null}
          {active === "reviews" ? (
            <TopicsView
              data={data}
              onToggleEnabled={setProblemEnabled}
              onBulkToggle={bulkSetEnabled}
              onTogglePriority={togglePriorityCategory}
            />
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
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <div className="relative flex items-center justify-center px-4 py-3">
          <h2 className="text-sm font-semibold">{dateLabel}</h2>
          <span className="absolute right-4 text-sm text-fg-subtle">
            {data.todayPlan || data.todayExtra.length
              ? `${items.filter((item) => item.isCompleted).length + data.todayExtra.length}/${items.length + data.todayExtra.length} 题`
              : "未生成"}
          </span>
        </div>
        <div className="h-1 w-full bg-muted">
          <div
            className="h-1 bg-emerald-500 transition-[width] duration-300"
            style={{
              width: `${
                items.length + data.todayExtra.length
                  ? Math.round(
                      ((items.filter((item) => item.isCompleted).length + data.todayExtra.length) /
                        (items.length + data.todayExtra.length)) *
                        100,
                    )
                  : 0
              }%`,
            }}
          />
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
// dropped it). Same row style as a completed TaskRow, but read-only — its notes
// live on the problem detail page (there's no plan item left to re-edit).
function ExtraDoneRow({ extra }: { extra: DashboardData["todayExtra"][number] }) {
  return (
    <div className="flex flex-col gap-3 px-3 py-3 lg:flex-row lg:items-center lg:gap-4">
      <div className="min-w-0 lg:flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={difficultyClass[extra.difficulty as keyof typeof difficultyClass]}>
            {difficultyCn[extra.difficulty as keyof typeof difficultyCn]}
          </Badge>
          <span className="font-mono text-xs text-fg-subtle">#{extra.frontendId}</span>
          <a href={extra.leetcodeCnUrl} target="_blank" className="font-medium text-fg break-words hover:text-blue-400">
            {extra.titleCn}
          </a>
          <Badge className={kindClass[extra.kind as keyof typeof kindClass]}>
            {kindLabel[extra.kind as keyof typeof kindLabel]}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            <BarChart3 size={13} /> 反馈均分 {(extra.avgFeelingScore ?? 5).toFixed(1)}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:w-[260px] lg:shrink-0">
        <a
          href={`/problems/${extra.problemId}`}
          title="查看做题记录与笔记"
          className="inline-flex h-9 w-full items-center justify-center whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
        >
          已完成
        </a>
        <a
          href={extra.leetcodeCnUrl}
          target="_blank"
          className="inline-flex h-9 w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-line-strong px-2 text-sm font-medium text-fg hover:bg-muted"
        >
          <ExternalLink size={14} />
          去刷题
        </a>
      </div>
    </div>
  );
}

function WeeklyView({
  days,
  initialPlans,
  history,
  problems,
  today,
  onMove,
  onAddProblem,
  onAsk,
  busy,
}: {
  days: WeekDay[];
  initialPlans: WeekPlans;
  history: DashboardData["weekHistory"];
  problems: DashboardData["problems"];
  today: string;
  onMove: (id: string, date: string) => Promise<WeekPlans | null>;
  onAddProblem: (date: string, problemId: string) => Promise<WeekPlans | null>;
  onAsk: (
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
  ) => Promise<{ reply: string; weekPlans: WeekPlans | null }>;
  busy: boolean;
}) {
  const [plans, setPlans] = useState(initialPlans);
  const [query, setQuery] = useState("");
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [assistantInput, setAssistantInput] = useState("");
  const [openPanel, setOpenPanel] = useState<null | "assistant" | "search">(null);
  // Assistant chat history persists in localStorage so past exchanges stay
  // visible across visits; the recent tail is also sent for conversational
  // context ("再加一道" keeps meaning).
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(localStorage.getItem("planner-assistant-chat") ?? "[]");
      return Array.isArray(parsed) ? parsed.slice(-100) : [];
    } catch {
      return [];
    }
  });
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chat, openPanel, busy]);

  // Draggable assistant window: null = default anchored spot (above the FABs);
  // once dragged by its header it floats at {x,y}, persisted in localStorage.
  const assistantRef = useRef<HTMLDivElement>(null);
  const [assistantPos, setAssistantPos] = useState<{ x: number; y: number } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("planner-assistant-pos");
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed.x === "number" && typeof parsed.y === "number" ? parsed : null;
    } catch {
      return null;
    }
  });
  function startAssistantDrag(event: React.PointerEvent) {
    const panel = assistantRef.current;
    if (!panel || event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    const dy = event.clientY - rect.top;
    function move(moveEvent: PointerEvent) {
      const w = assistantRef.current?.offsetWidth ?? 380;
      const h = assistantRef.current?.offsetHeight ?? 300;
      const next = {
        x: Math.max(4, Math.min(window.innerWidth - w - 4, moveEvent.clientX - dx)),
        y: Math.max(4, Math.min(window.innerHeight - h - 4, moveEvent.clientY - dy)),
      };
      setAssistantPos(next);
      try {
        localStorage.setItem("planner-assistant-pos", JSON.stringify(next));
      } catch {}
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const plansByDate = new Map(plans.map((plan) => [plan.date, plan.items]));
  const todayKey = days[0]?.date ?? "";
  const pastDays = history.filter((day) => day.date < todayKey);

  const q = query.trim();
  const results = q
    ? problems
        .filter(
          (problem) =>
            problem.isEnabled !== false &&
            (problem.titleCn.includes(q) || String(problem.frontendId).includes(q)),
        )
        .slice(0, 12)
    : [];

  async function move(id: string, date: string) {
    const result = await onMove(id, date);
    if (result) setPlans(result);
  }

  async function addProblem(date: string, problemId: string) {
    const result = await onAddProblem(date, problemId);
    if (result) setPlans(result);
  }

  function onDropDay(date: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOverDate(null);
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    let payload: { kind?: string; id?: string; problemId?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.kind === "move" && payload.id) {
      void move(payload.id, date);
    } else if (payload.kind === "add" && payload.problemId) {
      void addProblem(date, payload.problemId);
    }
  }

  function pushChat(entry: { role: "user" | "assistant"; content: string }) {
    setChat((current) => {
      const next = [...current, entry].slice(-100);
      try {
        localStorage.setItem("planner-assistant-chat", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  async function sendToAssistant() {
    const message = assistantInput.trim();
    if (!message || busy) {
      return;
    }
    const historyForApi = chat.slice(-8);
    pushChat({ role: "user", content: message });
    setAssistantInput("");
    const { reply, weekPlans } = await onAsk(message, historyForApi);
    pushChat({ role: "assistant", content: reply });
    if (weekPlans) {
      setPlans(weekPlans);
    }
  }

  return (
    <section className="space-y-6">
      {/* 计划助手：可拖动的悬浮聊天窗（默认在 FAB 上方，拖动标题栏后自由放置）。 */}
      {openPanel === "assistant" ? (
        <div
          ref={assistantRef}
          style={
            assistantPos
              ? { left: assistantPos.x, top: assistantPos.y, right: "auto", bottom: "auto" }
              : undefined
          }
          className="fixed bottom-24 right-6 z-50 flex max-h-[70vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        >
          <div className="flex items-center gap-2 border-b border-line pr-2 text-sm font-semibold">
            <div
              onPointerDown={startAssistantDrag}
              className="flex flex-1 cursor-move touch-none select-none items-center gap-2 px-3 py-2"
              title="拖动可移动窗口"
            >
              <Sparkles size={15} className="shrink-0 text-amber-500" />
              计划助手
            </div>
            <button
              onClick={() => {
                setChat([]);
                try {
                  localStorage.removeItem("planner-assistant-chat");
                } catch {}
              }}
              className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:bg-muted"
              title="清空聊天记录"
            >
              清空
            </button>
            <button
              onClick={() => setOpenPanel(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-muted"
              title="收起"
            >
              <X size={14} />
            </button>
          </div>
          <div ref={chatRef} className="min-h-[10rem] flex-1 space-y-2 overflow-y-auto px-3 py-2">
              {chat.length ? (
                chat.map((entry, index) => (
                  <div
                    key={index}
                    className={`whitespace-pre-wrap rounded-lg px-2.5 py-1.5 text-sm leading-6 ${
                      entry.role === "user"
                        ? "ml-8 bg-blue-50 text-blue-900 dark:bg-blue-500/15 dark:text-blue-100"
                        : "mr-8 bg-muted text-fg"
                    }`}
                  >
                    {entry.content}
                  </div>
                ))
              ) : (
                <p className="text-xs leading-5 text-fg-subtle">
                  用一句话让助手帮你排题，比如：
                  <br />· 「优先刷回溯和DP」「每天改成5道新题」
                  <br />· 「把接雨水加到周六」「把#146移到周三」「把#3从计划里去掉」
                  <br />· 「链表这一类先不刷」「#42 三天后再复习」
                  <br />· 「我哪些题最不熟，本周该重点刷什么？」
                </p>
              )}
              {busy ? (
                <div className="mr-8 rounded-lg bg-muted px-2.5 py-1.5 text-sm text-fg-subtle">思考中…</div>
              ) : null}
            </div>
            <div className="flex gap-2 border-t border-line p-2">
              <input
                value={assistantInput}
                onChange={(event) => setAssistantInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void sendToAssistant();
                  }
                }}
                placeholder="告诉助手你想怎么排…"
                className="h-9 min-w-0 flex-1 rounded-md border border-line bg-canvas px-3 text-sm outline-none focus:border-line-strong"
              />
              <button
                onClick={() => void sendToAssistant()}
                disabled={busy || !assistantInput.trim()}
                className="inline-flex h-9 shrink-0 items-center rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-btn-strong"
              >
                发送
              </button>
            </div>
          </div>
      ) : null}

      {/* 悬浮工具簇：搜索题目 / 计划助手。圆形按钮点击原地展开面板。 */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
        {openPanel === "search" ? (
          <div className="flex max-h-[60vh] w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm font-semibold">
              <Search size={15} className="shrink-0 text-fg-subtle" />
              搜索题目
              <button
                onClick={() => setOpenPanel(null)}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-muted"
                title="收起"
              >
                <X size={14} />
              </button>
            </div>
            <div className="space-y-2 overflow-y-auto p-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="题号或名称，把结果拖到某一天"
                autoFocus
                className="h-9 w-full rounded-md border border-line bg-canvas px-3 text-sm outline-none focus:border-line-strong"
              />
              {q ? (
                results.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {results.map((problem) => (
                      <div
                        key={problem.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData(
                            "application/json",
                            JSON.stringify({ kind: "add", problemId: problem.id }),
                          );
                          event.dataTransfer.effectAllowed = "copy";
                        }}
                        className="flex cursor-grab items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs active:cursor-grabbing"
                        title="拖到某一天加入计划"
                      >
                        <GripVertical size={12} className="shrink-0 text-fg-subtle" />
                        <span className="font-mono text-[11px] text-fg-subtle">#{problem.frontendId}</span>
                        <span className="max-w-[11rem] truncate">{problem.titleCn}</span>
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold ${difficultyClass[problem.difficulty]}`}>
                          {problem.difficulty === "EASY" ? "易" : problem.difficulty === "MEDIUM" ? "中" : "难"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">没有匹配的题目。</p>
                )
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpenPanel((current) => (current === "search" ? null : "search"))}
            className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition ${
              openPanel === "search"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-line bg-surface text-fg-muted hover:bg-muted"
            }`}
            title="搜索题目并拖入计划"
          >
            <Search size={18} />
          </button>
          <button
            onClick={() => setOpenPanel((current) => (current === "assistant" ? null : "assistant"))}
            className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg transition ${
              openPanel === "assistant"
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-amber-300 bg-surface text-amber-500 hover:bg-muted dark:border-amber-500/40"
            }`}
            title="计划助手"
          >
            <Sparkles size={18} />
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-fg">本周计划</h3>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {days.map((day) => {
            const items = plansByDate.get(day.date) ?? [];
            const isOver = dragOverDate === day.date;
            const isPast = day.date < today;
            return (
              <div
                key={day.date}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragOverDate !== day.date) setDragOverDate(day.date);
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setDragOverDate((current) => (current === day.date ? null : current));
                  }
                }}
                onDrop={(event) => onDropDay(day.date, event)}
                className={`rounded-lg border bg-surface p-3 transition-colors ${
                  isOver ? "border-blue-400 ring-1 ring-blue-400/40" : "border-line"
                } ${isPast ? "opacity-55" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{weekdayLabels[day.weekday]}</span>
                    <span className="text-xs text-fg-subtle">{formatYmd(day.date)}</span>
                  </div>
                  <span className="text-xs font-medium tabular-nums text-fg-subtle">{items.length} 题</span>
                </div>
                <DayPlanList items={items} />
              </div>
            );
          })}
        </div>
      </div>

      {pastDays.length ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-fg">以前的计划</h3>
          <p className="mb-3 text-xs text-fg-subtle">按天回顾之前做过的题和当时的反馈分。</p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
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
        </div>
      ) : null}
    </section>
  );
}

function HistoryView({ data }: { data: DashboardData }) {
  const [filter, setFilter] = useState("");

  if (!data.weekHistory.length) {
    return (
      <EmptyState text="还没有做题记录。在今日任务里完成题目并提交反馈后，会按天出现在这里。" />
    );
  }

  const q = filter.trim();
  const history = q
    ? data.weekHistory
        .map((day) => ({
          ...day,
          items: day.items.filter(
            (entry) => entry.titleCn.includes(q) || String(entry.frontendId).includes(q),
          ),
        }))
        .filter((day) => day.items.length)
    : data.weekHistory;

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="按题号或题目名称过滤笔记"
          className="h-9 w-full rounded-md border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-line-strong"
        />
      </div>
      {history.length ? (
        history.map((day) => {
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
        })
      ) : (
        <p className="text-sm text-fg-subtle">没有匹配「{q}」的记录。</p>
      )}
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
        <span className={`shrink-0 text-xs font-medium ${kindTextClass[entry.kind as keyof typeof kindTextClass]}`}>
          {kindLabel[entry.kind as keyof typeof kindLabel]}
        </span>
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
              <div className="mt-1.5 min-h-16 rounded-md border border-line bg-muted p-3 text-sm leading-6 text-fg-muted">
                {entry.noteMarkdown ? <NoteContent value={entry.noteMarkdown} /> : "—"}
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1 text-sm font-medium text-fg">
                <Code2 size={14} /> C++ 语法 / 知识点
              </div>
              <div className="mt-1.5 min-h-16 rounded-md border border-line bg-muted p-3 text-sm leading-6 text-fg-muted">
                {entry.noteSyntax ? <NoteContent value={entry.noteSyntax} /> : "—"}
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
            <li
              key={item.id}
              draggable={!item.isCompleted}
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  "application/json",
                  JSON.stringify({ kind: "move", id: item.id }),
                );
                event.dataTransfer.effectAllowed = "move";
              }}
              className={`flex items-center gap-1 rounded-md pr-1 ${
                item.isCompleted ? "" : "cursor-grab hover:bg-muted active:cursor-grabbing"
              }`}
              title={item.isCompleted ? undefined : "拖到别的一天即可移动"}
            >
              {item.isCompleted ? (
                <span className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <GripVertical size={13} className="shrink-0 text-fg-subtle" />
              )}
              <a
                href={`/problems/${item.problem.id}`}
                draggable={false}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
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
                <span className={`shrink-0 text-[10px] font-medium ${kindTextClass[item.kind]}`}>{kindLabel[item.kind]}</span>
                {item.carriedFromDate ? (
                  <span
                    className="shrink-0 rounded border border-orange-200 bg-orange-50 px-1 py-0.5 text-[10px] font-semibold text-orange-600 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300"
                    title={`${item.carriedFromDate} 未完成，自动顺延到今天（叠加在每日新题目标之上）`}
                  >
                    顺延
                  </span>
                ) : null}
                {item.isCompleted ? <Check size={12} className="shrink-0 text-emerald-500" /> : null}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-fg-subtle">把题目拖到这里，或点右上角「+」追加一题。</p>
      )}
    </div>
  );
}


const difficultyCn = { EASY: "简单", MEDIUM: "中等", HARD: "困难" };

function TopicsView({
  data,
  onToggleEnabled,
  onBulkToggle,
  onTogglePriority,
}: {
  data: DashboardData;
  onToggleEnabled: (problemId: string, isEnabled: boolean) => void;
  onBulkToggle: (problemIds: string[], isEnabled: boolean) => void;
  onTogglePriority: (name: string) => void;
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
        <p className="text-sm text-fg-subtle">
          点分类标题旁的 ⭐ 设为优先：排题时每天先从每个优先类各取一道新题，剩余名额按 Hot100 顺序补。勾选「不刷」把题目或整类排除出刷题列表。
        </p>
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
              <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => onTogglePriority(group.name)}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${
                  data.planSettings.priorityCategories.includes(group.name)
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
                    : "border-line-strong text-fg-subtle hover:bg-muted"
                }`}
                title="优先类别：排题时每天先从这里取一道新题（改完点周计划的「重排本周」立即生效）"
              >
                ⭐ {data.planSettings.priorityCategories.includes(group.name) ? "优先中" : "设为优先"}
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

function MasteryStat({ label, hint, value, tone }: { label: string; hint: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-fg-subtle">{label}</span>
        <span className="text-[11px] text-fg-subtle">{hint}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight ${tone}`}>{value}</div>
    </div>
  );
}

function StatsView({ data }: { data: DashboardData; completion: number }) {
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const scored = data.problems
    .filter(
      (problem) =>
        problem.isEnabled !== false &&
        problem.feelingSessionCount > 0 &&
        problem.avgFeelingScore !== null,
    )
    .sort((a, b) => {
      const diff = (a.avgFeelingScore ?? 0) - (b.avgFeelingScore ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });
  // Same threshold as the 累计完成 metric: avg < 3 counts as mastered.
  const mastered = scored.filter((problem) => (problem.avgFeelingScore ?? 5) < 3).length;
  const shaky = scored.filter(
    (problem) => (problem.avgFeelingScore ?? 5) >= 3 && (problem.avgFeelingScore ?? 5) < 4,
  ).length;
  const weak = scored.filter((problem) => (problem.avgFeelingScore ?? 5) >= 4).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <MasteryStat label="已掌握" hint="平均分 < 3" value={mastered} tone="text-emerald-600 dark:text-emerald-400" />
        <MasteryStat label="需巩固" hint="平均分 3 ~ 4" value={shaky} tone="text-amber-600 dark:text-amber-400" />
        <MasteryStat label="生疏" hint="平均分 ≥ 4" value={weak} tone="text-red-600 dark:text-red-400" />
      </div>
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
      <Panel title="数据备份">
        <p className="text-sm text-fg-subtle">
          一键导出全部做题记录、笔记、复习计划和已同步的代码为 JSON 文件，妥善保存到本地。服务器每天凌晨也会自动备份数据库（保留最近 7 份）。
        </p>
        <a
          href="/api/export"
          className="mt-3 inline-flex h-10 items-center gap-2 rounded-md border border-line-strong px-4 text-sm font-semibold text-fg hover:bg-muted"
        >
          <DatabaseZap size={16} />
          导出全部数据
        </a>
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
  // Notes are edited as plain text in Monaco; legacy rich-text notes flatten
  // (text and line breaks kept) the first time they're opened.
  const [noteMarkdown, setNoteMarkdown] = useState(() => noteToPlainText(item.session?.noteMarkdown ?? ""));
  const [noteSyntax, setNoteSyntax] = useState(() => noteToPlainText(item.session?.noteSyntax ?? ""));
  const past = item.history ?? [];
  // Keyed by problem so unsent notes survive a re-plan (plan-item ids change).
  const draftKeyMd = `note-draft:${item.problem.id}:md`;
  const draftKeySyntax = `note-draft:${item.problem.id}:syntax`;

  function chooseScore(score: number) {
    setFeelingScore(score);
    // Default interval follows mastery (average score incl. this one):
    // avg < 2 → 14 days, avg < 3 → 7 days, else the per-score interval.
    setReviewAfterDays(
      defaultReviewDays(
        score as FeelingScore,
        item.problem.avgFeelingScore,
        item.problem.feelingSessionCount,
      ),
    );
  }

  function submitFeedback() {
    if (feelingScore === null) {
      return;
    }

    onMark(item.id, feelingScore, reviewAfterDays, noteMarkdown, noteSyntax);
    // Notes are on their way to the server; drop the crash-safety drafts.
    try {
      localStorage.removeItem(draftKeyMd);
      localStorage.removeItem(draftKeySyntax);
    } catch {}
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
            <Badge className={kindClass[item.kind]}>{kindLabel[item.kind]}</Badge>
            {item.carriedFromDate ? (
              <Badge
                className="border-orange-200 bg-orange-50 text-orange-600 dark:border-orange-500/30 dark:bg-orange-500/15 dark:text-orange-300"
                title={`${item.carriedFromDate} 未完成，自动顺延到今天`}
              >
                顺延
              </Badge>
            ) : null}
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
            <div className="text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1 font-medium text-fg">
                <BookOpen size={14} /> 解题思路笔记
              </span>
              <MonacoNoteEditor
                value={noteMarkdown}
                onChange={setNoteMarkdown}
                draftKey={draftKeyMd}
              />
            </div>
            <div className="text-sm text-fg-muted">
              <span className="inline-flex items-center gap-1 font-medium text-fg">
                <Code2 size={14} /> C++ 语法 / 知识点
              </span>
              <MonacoNoteEditor
                value={noteSyntax}
                onChange={setNoteSyntax}
                draftKey={draftKeySyntax}
              />
            </div>
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
                          <NoteContent value={entry.noteMarkdown} className="mt-1 leading-5 text-fg-muted" />
                        </div>
                      ) : null}
                      {entry.noteSyntax ? (
                        <div className="mt-2">
                          <div className="font-medium text-fg-muted">C++ 语法 / 知识点</div>
                          <NoteContent value={entry.noteSyntax} className="mt-1 leading-5 text-fg-muted" />
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

// Four clearly-stepped levels per theme: light = deeper amber means more,
// dark = brighter amber means more (GitHub-style, alpha steps were too subtle).
function heatLevelClass(count: number, future: boolean) {
  if (future) return "bg-transparent";
  if (count <= 0) return "bg-muted";
  if (count <= 1) return "bg-amber-200 dark:bg-amber-900";
  if (count <= 3) return "bg-amber-400 dark:bg-amber-600";
  if (count <= 5) return "bg-amber-600 dark:bg-amber-400";
  return "bg-amber-800 dark:bg-amber-200";
}

// Today overview: key metrics plus a GitHub-style contribution heatmap of daily
// study counts, all in one card. Heatmap columns are weeks (Monday top → Sunday
// bottom); darker green = more problems studied that day.
function TodayOverview({ data }: { data: DashboardData }) {
  const heatmap = data.heatmap;
  const { weekNew, monthNew, mastered } = data.metrics;

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
      <div className="grid grid-cols-3 gap-4">
        <OverviewStat label="本周进度" value={`${weekNew.done}/${weekNew.target}`} />
        <OverviewStat label="本月进度" value={`${monthNew.done}/${monthNew.target}`} />
        <OverviewStat label="累计完成" value={`${mastered}`} />
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

function OverviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs font-medium text-fg-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
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

function Badge({ className, children, title }: { className: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex rounded border px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-line-strong bg-muted text-sm text-fg-subtle">
      {text}
    </div>
  );
}
