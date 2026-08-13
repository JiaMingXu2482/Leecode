// DeepSeek 函数调用的对话循环。两个助手共用：周计划的「排课助手」（可读可写）
// 和算法总结页的「笔记助手」（只读）。工具集和系统提示由调用方给，这里只负责
// 跑循环、处理超时/报错、把工具结果喂回去。

export const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export type ToolCall = { id: string; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatResult =
  | { ok: true; reply: string; toolsCalled: string[] }
  | { ok: false; status: number; error: string };

// 把客户端传来的聊天记录尾巴清洗成合法的 messages。
export function sanitizeHistory(raw: unknown, limit = 8): ChatMessage[] {
  return (Array.isArray(raw) ? raw : [])
    .filter(
      (entry): entry is { role: "user" | "assistant"; content: string } =>
        (entry?.role === "user" || entry?.role === "assistant") &&
        typeof entry?.content === "string" &&
        entry.content.length > 0,
    )
    .slice(-limit)
    .map((entry) =>
      entry.role === "user"
        ? { role: "user", content: entry.content.slice(0, 2000) }
        : { role: "assistant", content: entry.content.slice(0, 2000) },
    );
}

export async function runDeepSeekChat({
  apiKey,
  messages,
  tools,
  runTool,
  maxRounds = 12,
  timeoutMs = 60_000,
}: {
  apiKey: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  runTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  maxRounds?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const toolsCalled: string[] = [];
  let reply = "";

  for (let round = 0; round < maxRounds; round += 1) {
    let response: Response;
    try {
      response = await fetch(DEEPSEEK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "deepseek-chat", messages, tools, temperature: 0 }),
        // 上游卡住不能把请求（和界面上的转圈）一起拖死。
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      return {
        ok: false,
        status: 504,
        error: timedOut ? "DeepSeek 响应超时，请稍后重试。" : "DeepSeek 连接失败，请稍后重试。",
      };
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        status: 502,
        error: `DeepSeek 调用失败 (${response.status}): ${detail.slice(0, 200)}`,
      };
    }

    const payload = (await response.json()) as {
      choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[];
    };
    const assistantMessage = payload.choices[0]?.message;
    if (!assistantMessage) {
      return { ok: false, status: 502, error: "DeepSeek 返回为空" };
    }
    messages.push({
      role: "assistant",
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
    });

    if (!assistantMessage.tool_calls?.length) {
      reply = assistantMessage.content ?? "已处理。";
      return { ok: true, reply, toolsCalled };
    }

    for (const call of assistantMessage.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {}
      // 单个工具炸了不能让整轮对话 500 —— 把错误喂回去，让模型自己调整或如实汇报。
      let result: string;
      try {
        result = await runTool(call.function.name, args);
        toolsCalled.push(call.function.name);
      } catch (error) {
        result = `工具执行出错: ${error instanceof Error ? error.message : String(error)}`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }

  return { ok: true, reply: reply || "已处理（本次对话轮数达到上限）。", toolsCalled };
}
