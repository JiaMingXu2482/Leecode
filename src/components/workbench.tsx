"use client";

import {
  AlertTriangle,
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
  Plus,
  RefreshCw,
  Settings2,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-data";

type ActiveView = "today" | "weekly" | "problems" | "reviews" | "stats" | "sync";
type Slot = DashboardData["slots"][number];

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
  weekly: { title: "周计划", subtitle: "按周几和具体时段安排刷题，不再固定上午或固定星期。" },
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

export function Workbench({ data, active }: { data: DashboardData; active: ActiveView }) {
  const [slots, setSlots] = useState(data.slots);
  const [cookie, setCookie] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
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

  async function generatePlan() {
    const ok = await requestJson("/api/plans/generate", { slots });
    if (ok) window.location.reload();
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

  function addSlot(date: string, weekday: number) {
    setSlots((current) => [
      ...current,
      {
        id: `${date}-${Date.now()}`,
        date,
        weekday,
        startTime: "19:30",
        endTime: "21:30",
        isAvailable: true,
        availableMinutes: 120,
      },
    ]);
  }

  function updateSlot(id: string, patch: Partial<Slot>) {
    setSlots((current) => current.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));
  }

  function removeSlot(id: string) {
    setSlots((current) => current.filter((slot) => slot.id !== id));
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
              <h1 className="text-xl font-semibold tracking-tight">{viewTitle[active].title}</h1>
              <p className="mt-1 text-sm text-slate-500">{viewTitle[active].subtitle}</p>
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
            <WeeklyView slots={slots} setSlot={updateSlot} addSlot={addSlot} removeSlot={removeSlot} generatePlan={generatePlan} />
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
  const grouped = useMemo(() => groupItemsBySlot(data.todayPlan?.items ?? []), [data.todayPlan]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-5">
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
        <Panel title="今日计划" action={data.todayPlan ? `${data.todayPlan.items.length} 项` : "未生成"}>
          {grouped.length ? (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.key} className="rounded-md border border-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium">{group.label}</span>
                    <span className="text-slate-500">{group.items.reduce((sum, item) => sum + item.estimatedMinutes, 0)}m</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((item) => (
                      <TaskRow key={item.id} item={item} onMark={onMark} onRemove={onRemove} onExclude={onExclude} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="还没有今日计划。去周计划页设置可用时段，然后生成计划。" />
          )}
        </Panel>
      </section>
      <aside className="space-y-5">
        <ProgressPanel data={data} completion={completion} />
        <Panel title="今日规则" action="无需手动计时">
          <ul className="space-y-2 text-sm leading-6 text-slate-600">
            <li>1. 点击“打开力扣”做题。</li>
            <li>2. 做完后点“已处理”，用 0-5 分记录做题感觉。</li>
            <li>3. 分数越高代表越不熟，系统会越快安排复习。</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}

function WeeklyView({
  slots,
  setSlot,
  addSlot,
  removeSlot,
  generatePlan,
}: {
  slots: Slot[];
  setSlot: (id: string, patch: Partial<Slot>) => void;
  addSlot: (date: string, weekday: number) => void;
  removeSlot: (id: string) => void;
  generatePlan: () => void;
}) {
  const days = [...new Map(slots.map((slot) => [slot.date, slot])).values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  return (
    <section className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-7">
        {days.map((day) => (
          <div key={day.date} className="min-h-64 rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">{weekdayLabels[day.weekday]}</div>
                <div className="text-xs text-slate-500">{day.date}</div>
              </div>
              <button
                onClick={() => addSlot(day.date, day.weekday)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                title="添加时段"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {slots
                .filter((slot) => slot.date === day.date)
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map((slot) => (
                  <div key={slot.id} className="rounded-md border border-slate-200 p-2">
                    <div className="grid grid-cols-[1fr_1fr_28px] gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(event) => setSlot(slot.id, { startTime: event.target.value })}
                        className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                      />
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(event) => setSlot(slot.id, { endTime: event.target.value })}
                        className="h-8 rounded-md border border-slate-300 px-2 text-xs"
                      />
                      <button
                        onClick={() => removeSlot(slot.id)}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-red-600"
                        title="删除时段"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={slot.isAvailable}
                        onChange={(event) => setSlot(slot.id, { isAvailable: event.target.checked })}
                      />
                      可刷题 · {slot.startTime}-{slot.endTime}
                    </label>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      <button onClick={generatePlan} className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
        保存时段并生成周计划
      </button>
    </section>
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
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-5">
        <MetricGrid data={data} completion={completion} />
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
      </section>
      <ProgressPanel data={data} completion={completion} />
    </div>
  );
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
      <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_80px_300px] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-400">#{item.problem.frontendId}</span>
            <a href={item.problem.leetcodeCnUrl} target="_blank" className="font-medium text-slate-900 hover:text-blue-600">
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
        <div className="text-sm text-slate-600">{item.estimatedMinutes}m</div>
        <div className="flex flex-wrap gap-2">
          <a
            href={item.problem.leetcodeCnUrl}
            target="_blank"
            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink size={14} />
            打开力扣
          </a>
          {item.isCompleted ? (
            <>
              <span className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
                <Check size={14} /> 已处理
              </span>
              <button
                onClick={() => setFeedbackOpen((open) => !open)}
                className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Check size={14} />
                已处理
              </button>
              <button
                onClick={() => onRemove(item.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                title="从今日任务移除"
              >
                <Trash2 size={15} />
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
              <td className="border-b border-slate-100 py-3 text-slate-600">{problem.lastAcceptedAt?.slice(0, 10) ?? "-"}</td>
              <td className="border-b border-slate-100 py-3">{riskPill(problem.reviewRiskScore)}</td>
              <td className="border-b border-slate-100 py-3 text-slate-600">{problem.nextReviewDate ?? "-"}</td>
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

function groupItemsBySlot(items: NonNullable<DashboardData["todayPlan"]>["items"]) {
  const map = new Map<string, { key: string; label: string; items: typeof items }>();

  for (const item of items) {
    const key = item.slot?.id ?? "unslotted";
    const label = item.slot
      ? `${weekdayLabels[item.slot.weekday]} ${item.slot.date} ${item.slot.startTime}-${item.slot.endTime}`
      : "未绑定时段";
    const group = map.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    map.set(key, group);
  }

  return [...map.values()];
}

function MetricGrid({ data, completion }: { data: DashboardData; completion: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Metric label="Hot100 完成" value={`${data.stats.accepted}/${data.stats.total}`} hint={`${completion}%`} />
      <Metric label="做题记录" value={`${data.stats.sessions}`} hint="累计 session" />
      <Metric label="今日预算" value={`${data.todayPlan?.totalEstimatedMinutes ?? 0}m`} hint={`${data.todayPlan?.availableMinutes ?? 0}m 可用`} />
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
