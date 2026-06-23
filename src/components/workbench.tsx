"use client";

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  DatabaseZap,
  ExternalLink,
  Flame,
  ListChecks,
  Plus,
  RefreshCw,
  Settings2,
  Target,
  Trash2,
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
  stats: { title: "统计", subtitle: "查看整体进度、标签覆盖和复习债。" },
  sync: { title: "力扣同步", subtitle: "粘贴 leetcode.cn Cookie，同步 AC 状态和提交画像。" },
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

  async function postJson(path: string, body: unknown) {
    setBusy(path);
    setMessage("");
    const response = await fetch(path, {
      method: path.includes("/plan-items/") ? "PATCH" : "POST",
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

  async function generatePlan() {
    const ok = await postJson("/api/plans/generate", { slots });
    if (ok) window.location.reload();
  }

  async function syncLeetCode() {
    const ok = await postJson("/api/sync/leetcode-cn", { cookie });
    if (ok) window.location.reload();
  }

  async function markItem(id: string) {
    const ok = await postJson(`/api/plan-items/${id}`, { completed: true });
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
          {active === "today" ? <TodayView data={data} onMark={markItem} completion={completion} /> : null}
          {active === "weekly" ? (
            <WeeklyView slots={slots} setSlot={updateSlot} addSlot={addSlot} removeSlot={removeSlot} generatePlan={generatePlan} />
          ) : null}
          {active === "problems" ? <ProblemsView data={data} /> : null}
          {active === "reviews" ? <ReviewsView data={data} /> : null}
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
  onMark,
  completion,
}: {
  data: DashboardData;
  onMark: (id: string) => void;
  completion: number;
}) {
  const grouped = useMemo(() => groupItemsBySlot(data.todayPlan?.items ?? []), [data.todayPlan]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="min-w-0 space-y-5">
        <MetricGrid data={data} completion={completion} />
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
                      <TaskRow key={item.id} item={item} onMark={onMark} />
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
            <li>2. 做完后点“已处理”，不需要填写反馈。</li>
            <li>3. 下次同步会更新提交次数、AC 次数和正确率。</li>
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

function ProblemsView({ data }: { data: DashboardData }) {
  return (
    <Panel title="题库画像" action={`${data.problems.length} 题`}>
      <ProblemTable problems={data.problems} />
    </Panel>
  );
}

function ReviewsView({ data }: { data: DashboardData }) {
  const reviews = [...data.problems]
    .filter((problem) => problem.nextReviewDate || problem.reviewRiskScore >= 50)
    .sort((a, b) => b.reviewRiskScore - a.reviewRiskScore);

  return (
    <Panel title="到期与高风险旧题" action={`${reviews.length} 题`}>
      <ProblemTable problems={reviews} />
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
          <Info label="错误" value={data.syncState.lastError || "-"} />
        </dl>
      </Panel>
    </div>
  );
}

function TaskRow({
  item,
  onMark,
}: {
  item: NonNullable<DashboardData["todayPlan"]>["items"][number];
  onMark: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_80px_220px] md:items-center">
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
      <div className="flex gap-2">
        <a
          href={item.problem.leetcodeCnUrl}
          target="_blank"
          className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink size={14} />
          打开力扣
        </a>
        {item.isCompleted ? (
          <span className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
            <Check size={14} /> 已处理
          </span>
        ) : (
          <button
            onClick={() => onMark(item.id)}
            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Check size={14} />
            已处理
          </button>
        )}
      </div>
    </div>
  );
}

function ProblemTable({ problems }: { problems: DashboardData["problems"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="border-b border-slate-200 py-2 font-medium">题目</th>
            <th className="border-b border-slate-200 py-2 font-medium">难度</th>
            <th className="border-b border-slate-200 py-2 font-medium">提交</th>
            <th className="border-b border-slate-200 py-2 font-medium">AC</th>
            <th className="border-b border-slate-200 py-2 font-medium">正确率</th>
            <th className="border-b border-slate-200 py-2 font-medium">最近 AC</th>
            <th className="border-b border-slate-200 py-2 font-medium">复习风险</th>
            <th className="border-b border-slate-200 py-2 font-medium">下次复习</th>
            <th className="border-b border-slate-200 py-2 font-medium">标签</th>
          </tr>
        </thead>
        <tbody>
          {problems.map((problem) => (
            <tr key={problem.id}>
              <td className="border-b border-slate-100 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-400">#{problem.frontendId}</span>
                  <a href={problem.leetcodeCnUrl} target="_blank" className="font-medium hover:text-blue-600">
                    {problem.titleCn}
                  </a>
                </div>
              </td>
              <td className="border-b border-slate-100 py-3"><Badge className={difficultyClass[problem.difficulty]}>{problem.difficulty}</Badge></td>
              <td className="border-b border-slate-100 py-3"><IconMetric icon={RefreshCw} value={problem.totalSubmissions} /></td>
              <td className="border-b border-slate-100 py-3"><IconMetric icon={Check} value={problem.acceptedSubmissions} /></td>
              <td className="border-b border-slate-100 py-3">{ratePill(problem.acceptedRate)}</td>
              <td className="border-b border-slate-100 py-3 text-slate-600">{problem.lastAcceptedAt?.slice(0, 10) ?? "-"}</td>
              <td className="border-b border-slate-100 py-3">{riskPill(problem.reviewRiskScore)}</td>
              <td className="border-b border-slate-100 py-3 text-slate-600">{problem.nextReviewDate ?? "-"}</td>
              <td className="border-b border-slate-100 py-3 text-xs text-slate-500">{problem.tags.split(",").slice(0, 3).join(" / ")}</td>
            </tr>
          ))}
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
    <div className="grid gap-4 md:grid-cols-4">
      <Metric label="Hot100 完成" value={`${data.stats.accepted}/${data.stats.total}`} hint={`${completion}%`} />
      <Metric label="复习债" value={`${data.stats.dueReviews}`} hint="到期/逾期" tone="warning" />
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
