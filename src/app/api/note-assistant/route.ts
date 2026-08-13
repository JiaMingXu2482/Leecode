import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { toDateKey, startOfUtcDay } from "@/lib/dates";
import { type ChatMessage, runDeepSeekChat, sanitizeHistory, type ToolSpec } from "@/lib/deepseek";
import {
  algoNoteBody,
  algoNoteIndex,
  problemHistory,
  progressSummary,
  recentSessions,
  topicBreakdown,
} from "@/lib/note-assistant-data";
import { getWeakProblems } from "@/lib/plan-actions";

// 笔记助手（算法总结页）。和周计划的排课助手共用一个 DEEPSEEK_API_KEY，但
// **只有读权限**：它能看做题历史、笔记原文、题型强弱和现有的算法总结，
// 但没有任何写工具 —— 不能改计划、不能改设置、不能新建/修改/删除笔记。
// 它的产出是文字，用户看完自己决定要不要存。

export const dynamic = "force-dynamic";

// 全部工具都是只读的。这里一旦加了会写库的工具，就破坏了这个助手的约定，
// 加之前先想清楚。
const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "get_recent_sessions",
      description:
        "读取最近做过的题：日期、题号、题型、反馈分（0=AC快…5=陌生，越高越不熟）、用时，以及当时写的思路/语法笔记原文。整理笔记前先看这个，了解用户最近在做什么、卡在哪。",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "往前看多少天，默认 14，最多 90" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_topic_breakdown",
      description:
        "按题型聚合最近的做题情况：每类做了几道、平均用时、平均反馈分（越高越不熟，按最不熟在前）。用于回答「我哪类最弱」「该先总结哪一类」。",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "统计窗口天数，默认 30，最多 180" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weak_problems",
      description:
        "读取做得最不熟的题（历史平均反馈分 >= 2，最不熟在前）和各分类的薄弱题数。用于挑出值得写进总结的题。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_problem_history",
      description:
        "读取某一道题的全部历史笔记原文（按题号）。写总结要引用用户自己当时的原话/踩过的坑时用。",
      parameters: {
        type: "object",
        properties: {
          frontendId: {
            type: "number",
            description: "内部题号：LeetCode 直接用题号(如 53)，牛客 HJ14 用 10014，速成题单 P2352 用 20012",
          },
        },
        required: ["frontendId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_algo_notes",
      description: "列出现有的算法总结（分类、标题、字数、开头摘要）。先看有没有已经写过的，避免重复。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_algo_note",
      description: "按标题读一篇算法总结的正文，用于在已有笔记上做增补或改写。",
      parameters: {
        type: "object",
        properties: { title: { type: "string", description: "笔记标题（可只写一部分）" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_progress",
      description: "读取三个题库各自的完成进度。",
      parameters: { type: "object", properties: {} },
    },
  },
];

function clampDays(value: unknown, fallback: number, max: number) {
  const days = Number(value);
  if (!Number.isFinite(days) || days < 1) {
    return fallback;
  }
  return Math.min(Math.floor(days), max);
}

async function runTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "get_recent_sessions":
      return recentSessions(clampDays(args.days, 14, 90));
    case "get_topic_breakdown":
      return topicBreakdown(clampDays(args.days, 30, 180));
    case "get_weak_problems": {
      const { problems, weakByCategory } = await getWeakProblems();
      if (!problems.length) {
        return "还没有足够的做题反馈来判断薄弱点。";
      }
      const list = problems
        .map((p) => `#${p.frontendId} ${p.titleCn}（${p.category}，均分${p.avg.toFixed(1)}，做过${p.count}次）`)
        .join("\n");
      return `按分类的薄弱题数: ${weakByCategory.map(([n, c]) => `${n}${c}题`).join("、")}\n最不熟的题:\n${list}`;
    }
    case "get_problem_history":
      return problemHistory(Number(args.frontendId));
    case "list_algo_notes":
      return algoNoteIndex();
    case "read_algo_note":
      return algoNoteBody(String(args.title ?? ""));
    case "get_progress":
      return progressSummary();
    default:
      return `未知工具: ${name}`;
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "未配置 DEEPSEEK_API_KEY，请在服务器 .env 中添加后重启。" },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    history?: unknown;
    noteContext?: string;
  };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2000) {
    return NextResponse.json({ error: "请输入一段 2000 字以内的内容" }, { status: 400 });
  }
  // 用户当前正在看/写的那篇笔记，方便直接说「帮我补一段」而不用重复粘贴。
  const noteContext =
    typeof body.noteContext === "string" ? body.noteContext.slice(0, 12_000) : "";

  const today = startOfUtcDay(new Date());
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是用户的算法笔记助手，帮他把刷题过程中零散的收获整理成成体系的算法总结。",
        `今天是 ${toDateKey(today)}。`,
        "",
        "【权限 · 重要】你是只读的。你能读用户的做题历史、每道题的笔记原文、题型强弱和现有的算法总结，但你没有任何写入能力：不能新建/修改/删除笔记，不能改刷题计划或设置，也接触不到网站代码。用户要求你「保存/写入/直接改」时，如实说明你只能产出内容，让他复制到编辑器里保存。",
        "",
        "【反馈分】0=AC快 1=AC慢 2=无提示AC 3=提交错误 4=思路不清晰 5=陌生。分数越高越不熟。",
        "【题号】LeetCode 用原题号；牛客 HJ14 的内部题号是 10014；速成题单 P 开头的在 20001-20069。",
        "",
        "【怎么干活】",
        "1. 动笔前先调工具了解情况：get_recent_sessions 看最近做了什么、卡在哪；get_topic_breakdown / get_weak_problems 看哪类最弱；list_algo_notes 看有没有写过，避免重复。",
        "2. 要引用用户踩过的坑时，用 get_problem_history 读他自己当时写的原话，不要凭空编。",
        "3. 输出用 Markdown，直接就是能贴进笔记的形态：## 小标题、```cpp 代码块、表格、列表。",
        "4. 正文里提到题目就写题号（#53、HJ14、P2352），这个网站会把题号自动变成链接。但代码块里的内容不会被链接，所以代表题列表要用 - 列表写，别包在代码块里。",
        "5. 内容要贴着用户的真实水平：他反馈分高的地方多写细节和踩坑，已经很熟的一笔带过。别写通用教程。",
        "",
        "回答用中文。要整理笔记时直接给 Markdown 正文；只是聊天/回答问题时用简洁纯文本，别硬套 Markdown。",
        noteContext
          ? `【用户当前正在看的笔记】\n${noteContext}`
          : "【用户当前没有打开某篇笔记】",
      ].join("\n"),
    },
    ...sanitizeHistory(body.history),
    { role: "user", content: message },
  ];

  const result = await runDeepSeekChat({ apiKey, messages, tools: TOOLS, runTool, maxRounds: 8 });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  // 整理笔记的产出本身就是 Markdown，不能像排课助手那样剥掉格式。
  return NextResponse.json({ reply: result.reply.trim() || "（没有内容）" });
}
