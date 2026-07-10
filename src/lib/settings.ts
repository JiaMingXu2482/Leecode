import { getDb } from "@/lib/db";
import { TOPIC_GROUPS } from "@/lib/topics";

// Default per-day new-problem quota (overridable via settings / the assistant).
export const NEW_PER_DAY = 4;

// Categories whose new problems get scheduled first, one per category per day.
// Applies until the user changes it (刷题计划 page or the plan assistant).
export const DEFAULT_PRIORITY_CATEGORIES = ["回溯", "贪心算法", "动态规划"];

export type PlanSettings = {
  priorityCategories: string[];
  newPerDay: number;
};

const VALID_NAMES = new Set(TOPIC_GROUPS.map((group) => group.name));

export function sanitizeCategories(names: unknown): string[] | null {
  if (!Array.isArray(names)) {
    return null;
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (typeof name !== "string" || !VALID_NAMES.has(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push(name);
  }
  return result;
}

export async function getPlanSettings(): Promise<PlanSettings> {
  const db = getDb();
  const row = await db.appSettings.findUnique({ where: { id: "default" } });
  // "" = never configured → the built-in default. "[]" = deliberately cleared.
  let priorityCategories = DEFAULT_PRIORITY_CATEGORIES;
  if (row?.priorityCategories) {
    try {
      priorityCategories = sanitizeCategories(JSON.parse(row.priorityCategories)) ?? DEFAULT_PRIORITY_CATEGORIES;
    } catch {
      priorityCategories = DEFAULT_PRIORITY_CATEGORIES;
    }
  }
  const newPerDay =
    row && row.newPerDay >= 1 && row.newPerDay <= 10 ? row.newPerDay : NEW_PER_DAY;
  return { priorityCategories, newPerDay };
}

export async function savePlanSettings(update: {
  priorityCategories?: string[];
  newPerDay?: number;
}) {
  const db = getDb();
  const data: { priorityCategories?: string; newPerDay?: number } = {};
  if (update.priorityCategories !== undefined) {
    data.priorityCategories = JSON.stringify(update.priorityCategories);
  }
  if (update.newPerDay !== undefined) {
    data.newPerDay = Math.max(1, Math.min(10, Math.floor(update.newPerDay)));
  }
  await db.appSettings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  });
}

// ---------------------------------------------------------------------------
// Plan-assistant "brain": a soul file (behavior contract, user-editable via the
// assistant) plus a long-term memory file (learned user preferences). Both live
// in AppSettings so they persist across deploys with the rest of the data.

export const DEFAULT_ASSISTANT_SOUL = [
  "你是用户专属的刷题规划管家，稳重、简洁、可靠。",
  "- 用户的每日新题配额存在设置里，是硬约束；复习题按艾宾浩斯自动排，不占配额。",
  "- 昨天没做完的新题，系统会自动顺延到今天，叠加在当天配额之上——这是用户要求的行为，属于正常现象，不算超额。",
  "- 优先类别的题每天各安排一道，剩余名额按 Hot100 顺序补。",
  "- 回复永远用简洁的中文纯文本。",
].join("\n");

const BRAIN_TEXT_LIMIT = 2000;
const MEMORY_MAX_LINES = 30;

export type AssistantBrain = {
  soul: string;
  memory: string;
};

export async function getAssistantBrain(): Promise<AssistantBrain> {
  const db = getDb();
  const row = await db.appSettings.findUnique({ where: { id: "default" } });
  return {
    soul: row?.assistantSoul?.trim() || DEFAULT_ASSISTANT_SOUL,
    memory: row?.assistantMemory?.trim() || "",
  };
}

export async function saveAssistantSoul(content: string) {
  const db = getDb();
  const soul = content.trim().slice(0, BRAIN_TEXT_LIMIT);
  await db.appSettings.upsert({
    where: { id: "default" },
    update: { assistantSoul: soul },
    create: { id: "default", assistantSoul: soul },
  });
  return soul;
}

// Appends one "- fact" line; oldest lines fall off past MEMORY_MAX_LINES so the
// prompt footprint stays bounded.
export async function appendAssistantMemory(fact: string) {
  const db = getDb();
  const row = await db.appSettings.findUnique({ where: { id: "default" } });
  const line = `- ${fact.trim().replace(/\s+/g, " ").slice(0, 200)}`;
  const lines = (row?.assistantMemory ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!lines.includes(line)) {
    lines.push(line);
  }
  const memory = lines.slice(-MEMORY_MAX_LINES).join("\n").slice(0, BRAIN_TEXT_LIMIT);
  await db.appSettings.upsert({
    where: { id: "default" },
    update: { assistantMemory: memory },
    create: { id: "default", assistantMemory: memory },
  });
  return memory;
}
