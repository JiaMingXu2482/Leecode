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
