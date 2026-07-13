import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/auth";
import { startOfUtcDay, toDateKey } from "@/lib/dates";
import {
  addProblemToDate,
  getWeakProblems,
  moveProblemToDate,
  regenerateWeek,
  removeProblemFromPlan,
  setCategoryEnabled,
  setProblemReviewDays,
} from "@/lib/plan-actions";
import {
  appendAssistantMemory,
  getAssistantBrain,
  getPlanSettings,
  sanitizeCategories,
  saveAssistantSoul,
  savePlanSettings,
} from "@/lib/settings";
import { stripMarkdown } from "@/lib/strip-markdown";
import { TOPIC_GROUPS } from "@/lib/topics";
import { loadWeekPlans } from "@/lib/week-plans";

// 计划助手: one natural-language instruction → DeepSeek function-calling →
// scheduling actions (priority categories, per-day quota, re-plan, add a
// problem). Runs entirely server-side; the key never reaches the browser.

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

// Authoritative, per-day rendering of the week plan. Injected into the system
// prompt and returned by get_current_plan so the model relays real data instead
// of inventing problem numbers / completion status. Flags days whose new-problem
// count differs from the per-day quota so the assistant notices imbalance.
function renderWeekPlan(weekPlans: Awaited<ReturnType<typeof loadWeekPlans>>, quota: number) {
  const weekday = "日一二三四五六";
  const todayKey = toDateKey(startOfUtcDay(new Date()));
  const fmt = (item: (typeof weekPlans)[number]["items"][number]) =>
    `#${item.problem.frontendId} ${item.problem.titleCn}${item.isCompleted ? "(已完成)" : ""}${
      item.kind === "NEW" && item.carriedFromDate ? `(顺延自${item.carriedFromDate.slice(5)})` : ""
    }`;
  return weekPlans
    .map((plan) => {
      const d = new Date(`${plan.date}T00:00:00Z`);
      const newItems = plan.items.filter((item) => item.kind === "NEW");
      const reviews = plan.items.filter((item) => item.kind !== "NEW");
      // Carried debt stacks on top of the quota, so only own picks are judged
      // against it — a day showing 4 own + 2 carried is on target, not over.
      const ownCount = newItems.filter((item) => !item.carriedFromDate).length;
      const carriedCount = newItems.length - ownCount;
      const breakdown = carriedCount > 0 ? `(当天${ownCount}+顺延${carriedCount})` : "";
      const flag =
        plan.date >= todayKey && ownCount !== quota
          ? `(当天新题${ownCount > quota ? "超出" : "少于"}目标${quota})`
          : "";
      return `${plan.date}(周${weekday[d.getUTCDay()]}) 新题${newItems.length}道${breakdown}${flag}: ${
        newItems.map(fmt).join("，") || "无"
      }；复习${reviews.length}道: ${reviews.map(fmt).join("，") || "无"}`;
    })
    .join("\n");
}

type ToolCall = { id: string; function: { name: string; arguments: string } };
type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const TOOLS = [
  {
    type: "function",
    function: {
      name: "set_priority_categories",
      description:
        "设置优先类别（排题时每天先从每个优先类各取一道新题）。传入完整的新列表，会覆盖旧设置。",
      parameters: {
        type: "object",
        properties: {
          categories: {
            type: "array",
            items: { type: "string" },
            description: `分类名列表，可选值: ${TOPIC_GROUPS.map((g) => g.name).join("、")}`,
          },
        },
        required: ["categories"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_new_per_day",
      description: "设置每天安排的新题数量（1-10）。",
      parameters: {
        type: "object",
        properties: { count: { type: "number", description: "每天新题数" } },
        required: ["count"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "regenerate_week",
      description:
        "按当前设置重排本周（今天到周日）：每天 = 到期复习 + 每日新题配额（优先类别先排）。已完成的题保留。修改设置后应调用它让改动生效。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "add_problem_to_date",
      description: "把某道题（按 LeetCode 题号）加到某一天的计划里。",
      parameters: {
        type: "object",
        properties: {
          frontendId: { type: "number", description: "LeetCode 题号，如 42" },
          date: { type: "string", description: "目标日期 YYYY-MM-DD" },
        },
        required: ["frontendId", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_problem_to_date",
      description: "把某道题移动到某一天（会先从今后其它天移除它，再加到目标日）。",
      parameters: {
        type: "object",
        properties: {
          frontendId: { type: "number", description: "LeetCode 题号" },
          date: { type: "string", description: "目标日期 YYYY-MM-DD" },
        },
        required: ["frontendId", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_problem",
      description: "把某道题从今天及以后的计划里移除（不影响已完成的记录）。",
      parameters: {
        type: "object",
        properties: { frontendId: { type: "number", description: "LeetCode 题号" } },
        required: ["frontendId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_problem_review_days",
      description: "设置某道题在几天后复习（1-90 天，从今天算）。用于调整某题下次复习的时间。",
      parameters: {
        type: "object",
        properties: {
          frontendId: { type: "number", description: "LeetCode 题号" },
          days: { type: "number", description: "几天后复习" },
        },
        required: ["frontendId", "days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_category_enabled",
      description:
        "把某个分类整类设为不刷(enabled=false，会从计划移除)或恢复刷题(enabled=true)。",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: `分类名，如 ${TOPIC_GROUPS.map((g) => g.name).join("、")}` },
          enabled: { type: "boolean", description: "true=恢复刷；false=不刷" },
        },
        required: ["category", "enabled"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weak_problems",
      description:
        "读取用户做得不熟的题（平均反馈分越高越不熟：2=有点生，3+=不熟，5=完全没思路），按最不熟在前返回，并给出各分类的薄弱题数。用于推荐本周该重点复习/多刷哪些题或哪一类。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "把用户表达的长期偏好/习惯记入长期记忆（跨对话生效），如「以后每天N道」「我周末不刷题」。一次性指令不要记。",
      parameters: {
        type: "object",
        properties: {
          fact: { type: "string", description: "一句话事实，如：用户每天只想做4道新题" },
        },
        required: ["fact"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_soul",
      description:
        "覆盖你的自我准则（soul）。仅当用户明确要求永久改变你的行事方式/人设时使用；新内容必须完整（会整体替换）。",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "新的完整自我准则，纯文本多行" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_plan",
      description: "读取本周计划（每天排了哪些题）和当前设置，用于回答用户问题或决定怎么调整。",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function runTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "set_priority_categories": {
      const categories = sanitizeCategories(args.categories);
      if (categories === null) {
        return "参数无效：categories 必须是分类名数组";
      }
      await savePlanSettings({ priorityCategories: categories });
      return `已设置优先类别: ${categories.length ? categories.join("、") : "（无）"}`;
    }
    case "set_new_per_day": {
      const count = Number(args.count);
      if (!Number.isFinite(count) || count < 1 || count > 10) {
        return "参数无效：count 必须是 1-10";
      }
      await savePlanSettings({ newPerDay: Math.floor(count) });
      return `已设置每天新题数: ${Math.floor(count)}`;
    }
    case "regenerate_week": {
      await regenerateWeek();
      return "已按当前设置重排本周。";
    }
    case "add_problem_to_date": {
      const result = await addProblemToDate(Number(args.frontendId), String(args.date));
      return result.message;
    }
    case "move_problem_to_date": {
      const result = await moveProblemToDate(Number(args.frontendId), String(args.date));
      return result.message;
    }
    case "remove_problem": {
      const result = await removeProblemFromPlan(Number(args.frontendId));
      return result.message;
    }
    case "set_problem_review_days": {
      const result = await setProblemReviewDays(Number(args.frontendId), Number(args.days));
      return result.message;
    }
    case "set_category_enabled": {
      const result = await setCategoryEnabled(String(args.category), Boolean(args.enabled));
      return result.message;
    }
    case "get_weak_problems": {
      const { problems, weakByCategory } = await getWeakProblems();
      if (!problems.length) {
        return "还没有足够的做题反馈来判断薄弱点（做题时打个分就会积累）。";
      }
      const list = problems
        .map((p) => `#${p.frontendId} ${p.titleCn}（${p.category}，均分${p.avg.toFixed(1)}，做过${p.count}次）`)
        .join("\n");
      const cats = weakByCategory.map(([name, n]) => `${name}${n}题`).join("、");
      return `按分类的薄弱题数: ${cats}\n最不熟的题（均分越高越不熟）:\n${list}`;
    }
    case "save_memory": {
      const fact = typeof args.fact === "string" ? args.fact.trim() : "";
      if (!fact) {
        return "参数无效：fact 不能为空";
      }
      await appendAssistantMemory(fact);
      return `已记住: ${fact}`;
    }
    case "update_soul": {
      const content = typeof args.content === "string" ? args.content.trim() : "";
      if (!content) {
        return "参数无效：content 不能为空";
      }
      await saveAssistantSoul(content);
      return "已更新自我准则。";
    }
    case "get_current_plan": {
      const [settings, weekPlans] = await Promise.all([
        getPlanSettings(),
        loadWeekPlans(startOfUtcDay(new Date())),
      ]);
      return `当前设置: 优先类别=${settings.priorityCategories.join("、") || "无"}, 每天新题=${settings.newPerDay}\n本周计划(以此为准):\n${renderWeekPlan(weekPlans, settings.newPerDay)}`;
    }
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
    history?: { role?: string; content?: string }[];
  };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 500) {
    return NextResponse.json({ error: "请输入一句 500 字以内的指令" }, { status: 400 });
  }
  // Recent chat tail from the client, for conversational context.
  const history: ChatMessage[] = (Array.isArray(body.history) ? body.history : [])
    .filter(
      (entry): entry is { role: "user" | "assistant"; content: string } =>
        (entry?.role === "user" || entry?.role === "assistant") &&
        typeof entry?.content === "string" &&
        entry.content.length > 0,
    )
    .slice(-8)
    .map((entry) =>
      entry.role === "user"
        ? { role: "user", content: entry.content.slice(0, 2000) }
        : { role: "assistant", content: entry.content.slice(0, 2000) },
    );

  const today = startOfUtcDay(new Date());
  const [settings, weekPlans, brain] = await Promise.all([
    getPlanSettings(),
    loadWeekPlans(today),
    getAssistantBrain(),
  ]);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是一个 LeetCode Hot100 刷题计划助手，通过调用工具帮用户调整刷题计划。",
        "【自我准则 · soul】\n" + brain.soul,
        "【长期记忆 · 用户偏好】\n" + (brain.memory || "（暂无，用户表达长期偏好时用 save_memory 记下来）"),
        `今天是 ${toDateKey(today)}（UTC 日期，周${"日一二三四五六"[today.getUTCDay()]}）。计划以自然周（周一到周日）为单位。`,
        `分类列表: ${TOPIC_GROUPS.map((g) => g.name).join("、")}。`,
        `当前设置: 优先类别=${settings.priorityCategories.join("、") || "无"}，每天新题=${settings.newPerDay}。复习题按艾宾浩斯到期日自动排，不需要你管。`,
        "能力: 你可以增删移动某天的题、设某题几天后复习、把某类设为不刷或恢复、设优先类别/每日新题数、重排本周；也能读当前计划和用户的薄弱题给出建议；还能记住用户的长期偏好(save_memory)。",
        "【本周计划快照 · 唯一真实来源】\n" + renderWeekPlan(weekPlans, settings.newPerDay),
        "铁律: 关于“某天有哪些题/几道/完成了没/题量”的一切回答，必须严格照抄上面的快照，只能说快照里真实存在的题；快照没列出的题号就是不在那天的计划里，绝不能凭题号自己补题名、编题目、或猜完成状态。数字要数准。",
        `配额铁律: 用户的计划是每天 ${settings.newPerDay} 道新题（复习题不算在内，另计）。这是硬约束，任何操作后每天“当天新题”都应尽量等于 ${settings.newPerDay} 道。例外——顺延：没做完的新题会被系统自动顺延（每天最多叠加2道，最早欠下的优先，其余留给后面几天；快照里标注“顺延自X”），比如当天4道+顺延2道=6道属于正常，不要把顺延题搬走或因此改配额。过期复习也会自动补课，但每天复习总量上限10道，最紧急优先，装不下的自动排到后面几天。移动/新增题目时绝不能把某天的“当天新题”堆到超过 ${settings.newPerDay} 道：如果会超额，就把那天原本排的、尚未完成的新题按超出的数量顺延到后面的日子（级联），使每天仍是 ${settings.newPerDay} 道；已完成的新题不动。快照里标了“当天新题超出/少于目标”的日子要主动提醒用户。只有用户明确表达“以后每天做 X 道”这种长期意愿时才调用 set_new_per_day 改配额；用户只是要求某一天临时多做/少做几道，属于一次性例外：照做即可，但绝不要因此改配额。`,
        `摊平优先用 regenerate_week: 当多天新题数偏离目标、或用户说“帮我把每天弄回 ${settings.newPerDay} 道/重新排匀”时，直接调用 regenerate_week，它会把本周每天重排成 ${settings.newPerDay} 道新题并保留已完成的题，是最省事的摊平方式；只有当用户指名要保留某几道题在特定某天时，才改用逐题 move。`,
        "记忆规则: 用户表达长期习惯/偏好/要求（“以后…”“我习惯…”“记住…”）时，立即用 save_memory 记一条简短事实并在回复里说明已记住；一次性指令不要记。仅当用户明确要求永久改变你的行事方式时才用 update_soul 更新自我准则。长期记忆里的偏好每次都要遵守。",
        "规则: 所有改动必须通过工具完成；修改设置(优先类别/每日新题数)后调用 regenerate_week 让本周立即生效（除非用户明确说只改设置）；用户问“该重点刷什么/哪里薄弱”时先 get_weak_problems 再给建议。你本轮做了增删移动等改动后，如果还要向用户汇报“最新的完整计划”，必须先调用 get_current_plan 拿改动后的真实数据，不要凭快照或记忆推算。",
        "最后用简洁的中文总结你做了什么或你的建议（三四句以内），用纯文本，不要用 markdown 星号或标题。",
      ].join("\n"),
    },
    ...history,
    { role: "user", content: message },
  ];

  let changed = false;
  let reply = "";
  // 12 rounds: cascading a move across several days costs one tool call per
  // hop, plus a final get_current_plan before the summary.
  for (let round = 0; round < 12; round += 1) {
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages,
          tools: TOOLS,
          temperature: 0,
        }),
        // A hung upstream must not hang the request (and the chat spinner)
        // forever; 60s per round is generous for a tool-calling turn.
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return NextResponse.json(
        { error: timedOut ? "DeepSeek 响应超时，请稍后重试。" : "DeepSeek 连接失败，请稍后重试。" },
        { status: 504 },
      );
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `DeepSeek 调用失败 (${response.status}): ${detail.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const payload = (await response.json()) as {
      choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
    };
    const assistantMessage = payload.choices[0]?.message;
    if (!assistantMessage) {
      return NextResponse.json({ error: "DeepSeek 返回为空" }, { status: 502 });
    }
    messages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
    });

    if (!assistantMessage.tool_calls?.length) {
      reply = assistantMessage.content ?? "已处理。";
      break;
    }
    for (const call of assistantMessage.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {}
      // A tool blowing up (bad args, DB hiccup) must not 500 the whole
      // conversation — feed the error back so the model can adapt or report.
      let result: string;
      try {
        result = await runTool(call.function.name, args);
        // Reads and brain writes don't touch the plan, so no weekPlans reload.
        const readOnly = ["get_current_plan", "get_weak_problems", "save_memory", "update_soul"];
        if (!readOnly.includes(call.function.name)) {
          changed = true;
        }
      } catch (error) {
        result = `工具执行出错: ${error instanceof Error ? error.message : String(error)}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return NextResponse.json({
    reply: stripMarkdown(reply || "已处理（本次对话轮数达到上限）。").trim(),
    weekPlans: changed ? await loadWeekPlans(today) : undefined,
  });
}
