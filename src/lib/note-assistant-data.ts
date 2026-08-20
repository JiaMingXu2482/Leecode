import { getDb } from "@/lib/db";
import { addUtcDays, startOfUtcDay, toDateKey } from "@/lib/dates";
import { topicForFrontendId } from "@/lib/topics";

// 笔记助手能看到的全部数据。全是只读查询 —— 这个助手不允许改任何东西，
// 它的产出是文字，由用户自己决定要不要存成笔记。

const SCORE_MEANING = "0=AC快 1=AC慢 2=无提示AC 3=提交错误 4=思路不清晰 5=陌生";

function label(problem: { displayId: string; frontendId: number; titleCn: string }) {
  return `${problem.displayId || `#${problem.frontendId}`} ${problem.titleCn}`;
}

// 最近做过的题：反馈分、用时、以及当时写的笔记原文。这是助手判断
// 「哪里不熟、笔记缺什么」的主要依据。
export async function recentSessions(days = 14, limit = 40) {
  const from = addUtcDays(startOfUtcDay(new Date()), -days);
  const rows = await getDb().studySession.findMany({
    where: { completedAt: { gte: from } },
    include: {
      problem: {
        select: { displayId: true, frontendId: true, titleCn: true, difficulty: true, source: true },
      },
    },
    orderBy: { completedAt: "desc" },
    take: limit,
  });
  if (!rows.length) {
    return `最近 ${days} 天没有做题记录。`;
  }
  const lines = rows.map((row) => {
    const idea = (row.noteMarkdown ?? "").trim();
    const syntax = (row.noteSyntax ?? "").trim();
    const notes = [
      idea ? `思路: ${idea.replace(/\s+/g, " ").slice(0, 300)}` : "思路: (空)",
      syntax ? `语法: ${syntax.replace(/\s+/g, " ").slice(0, 300)}` : "语法: (空)",
    ].join(" | ");
    const rate = typeof row.passRate === "number" ? ` 通过率${row.passRate}%` : "";
    return `${toDateKey(row.completedAt)} ${label(row.problem)} [${topicForFrontendId(row.problem.frontendId)}] 反馈${row.feelingScore ?? "-"}${rate} ${row.spentMinutes}分钟 ${notes}`;
  });
  return `反馈分含义: ${SCORE_MEANING}（越高越不熟）\n最近 ${days} 天做题记录（新到旧，共 ${rows.length} 条）:\n${lines.join("\n")}`;
}

// 按题型聚合：每类做了多少、平均多不熟、平均花多久。用来回答「我哪类最弱」。
export async function topicBreakdown(days = 30) {
  const from = addUtcDays(startOfUtcDay(new Date()), -days);
  const rows = await getDb().studySession.findMany({
    where: { completedAt: { gte: from } },
    select: {
      feelingScore: true,
      spentMinutes: true,
      problem: { select: { frontendId: true } },
    },
  });
  if (!rows.length) {
    return `最近 ${days} 天没有做题记录。`;
  }
  const byTopic = new Map<string, { n: number; minutes: number; scores: number[] }>();
  for (const row of rows) {
    const topic = topicForFrontendId(row.problem.frontendId);
    const entry = byTopic.get(topic) ?? { n: 0, minutes: 0, scores: [] };
    entry.n += 1;
    entry.minutes += row.spentMinutes ?? 0;
    if (typeof row.feelingScore === "number") {
      entry.scores.push(row.feelingScore);
    }
    byTopic.set(topic, entry);
  }
  const lines = [...byTopic.entries()]
    .map(([topic, entry]) => ({
      topic,
      n: entry.n,
      avgMinutes: Math.round(entry.minutes / entry.n),
      avgScore: entry.scores.length
        ? entry.scores.reduce((a, b) => a + b, 0) / entry.scores.length
        : null,
    }))
    .sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1))
    .map(
      (row) =>
        `${row.topic}: ${row.n}题 平均${row.avgMinutes}分钟 平均反馈${row.avgScore === null ? "-" : row.avgScore.toFixed(1)}`,
    );
  return `反馈分含义: ${SCORE_MEANING}（越高越不熟，按最不熟在前排序）\n最近 ${days} 天按题型:\n${lines.join("\n")}`;
}

// 某道题的全部历史笔记原文。助手整理某个知识点时用来引用用户自己的原话。
export async function problemHistory(frontendId: number) {
  const problem = await getDb().problem.findUnique({
    where: { frontendId },
    select: {
      displayId: true,
      frontendId: true,
      titleCn: true,
      difficulty: true,
      tags: true,
      sessions: {
        select: {
          completedAt: true,
          feelingScore: true,
          passRate: true,
          spentMinutes: true,
          noteMarkdown: true,
          noteSyntax: true,
        },
        orderBy: { completedAt: "desc" },
        take: 10,
      },
    },
  });
  if (!problem) {
    return `找不到题号 ${frontendId}。`;
  }
  if (!problem.sessions.length) {
    return `${label(problem)} 还没有做题记录。`;
  }
  const blocks = problem.sessions.map((session) => {
    const idea = (session.noteMarkdown ?? "").trim() || "(空)";
    const syntax = (session.noteSyntax ?? "").trim() || "(空)";
    const rate = typeof session.passRate === "number" ? ` 通过率${session.passRate}%` : "";
    return `【${toDateKey(session.completedAt)} 反馈${session.feelingScore ?? "-"}${rate} ${session.spentMinutes}分钟】\n思路: ${idea}\n语法: ${syntax}`;
  });
  return `${label(problem)} [${problem.tags}]\n${blocks.join("\n\n")}`;
}

// 现有的算法总结，只给标题和分类 + 正文开头，避免把整个知识库塞进上下文。
export async function algoNoteIndex() {
  const rows = await getDb().algoNote.findMany({
    select: { title: true, category: true, contentMarkdown: true, updatedAt: true },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
  });
  if (!rows.length) {
    return "还没有任何算法总结。";
  }
  return rows
    .map(
      (row) =>
        `[${row.category || "未分类"}] ${row.title}（${toDateKey(row.updatedAt)}，${row.contentMarkdown.length}字）: ${row.contentMarkdown.replace(/\s+/g, " ").slice(0, 120)}…`,
    )
    .join("\n");
}

// 按标题读一篇算法总结的正文。
export async function algoNoteBody(title: string) {
  const rows = await getDb().algoNote.findMany({
    select: { title: true, category: true, contentMarkdown: true },
  });
  const needle = title.trim().toLowerCase();
  const hit =
    rows.find((row) => row.title.toLowerCase() === needle) ??
    rows.find((row) => row.title.toLowerCase().includes(needle));
  if (!hit) {
    return `找不到标题包含「${title}」的笔记。现有: ${rows.map((row) => row.title).join("、") || "（无）"}`;
  }
  return `[${hit.category || "未分类"}] ${hit.title}\n\n${hit.contentMarkdown.slice(0, 12_000)}`;
}

// 三个题库的进度。
export async function progressSummary() {
  const db = getDb();
  const sources: [string, string][] = [
    ["CODEFUN", "华为题单"],
    ["NOWCODER", "牛客华为机试"],
    ["LEETCODE", "LeetCode Hot100"],
  ];
  const parts = await Promise.all(
    sources.map(async ([source, name]) => {
      const [total, done] = await Promise.all([
        db.problem.count({ where: { isEnabled: true, source } }),
        db.problem.count({ where: { isEnabled: true, source, sessions: { some: {} } } }),
      ]);
      return `${name} ${done}/${total}`;
    }),
  );
  return parts.join("，");
}
