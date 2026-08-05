import { topicForFrontendId } from "./topics";

export type NewPickCandidate = {
  id: string;
  frontendId: number;
  estimatedNewMinutes: number;
  difficulty: string;
  source: string;
};

// 每天最多排这么多道简单题，其余名额留给中等题。
export const EASY_PER_DAY = 1;

// Preference within a slot: 中等 first, then 困难, 简单 last (and capped).
function difficultyRank(difficulty: string) {
  if (difficulty === "MEDIUM") return 0;
  if (difficulty === "HARD") return 1;
  return 2;
}

// Pick one day's worth of new problems from `pool` (already filtered to
// enabled + never-studied, in problem order). Three passes:
//   1. one problem from each priority category, in the configured order;
//   2. fill remaining slots from categories not used yet today, so a day is a
//      mix of problem types rather than four string-parsing problems in a row;
//   3. if distinct categories run out, backfill by plain pool order.
// Every pass prefers 中等 over 困难 over 简单 and refuses to exceed
// EASY_PER_DAY easy problems; only the last-resort pass may break that cap, so
// a day is never left short of its quota.
// Category-internal order is always pool order, so problems still come in
// ascending number within a type.
// `alreadyUsedCategories` / `alreadyEasyCount` describe what the target day
// already holds — the scheduler tops a day up in batches, so without them a
// later batch would happily add a third 数组与排序 problem, or a second 简单 one.
export function orderDailyNewPicks<T extends NewPickCandidate>(
  pool: T[],
  priorityCategories: string[],
  count: number,
  alreadyUsedCategories: Iterable<string> = [],
  alreadyEasyCount = 0,
): T[] {
  // 速成题单优先，且严格按题单顺序刷。作者把 69 道题按算法分类编排好了
  // （动态规划 → 模拟 → 贪心 → …），打乱顺序、跳着挑难度都会破坏这个编排，
  // 所以这条路径不做分类分散、也不限制简单题数量。刷完自动回落到牛客 HJ。
  const codefun = pool.filter((candidate) => candidate.source === "CODEFUN");
  if (codefun.length) {
    return codefun.slice(0, count);
  }

  const picks: T[] = [];
  const used = new Set<string>();
  const usedCategories = new Set<string>(alreadyUsedCategories);
  let easyCount = alreadyEasyCount;

  const take = (candidate: T) => {
    used.add(candidate.id);
    usedCategories.add(topicForFrontendId(candidate.frontendId));
    if (candidate.difficulty === "EASY") {
      easyCount += 1;
    }
    picks.push(candidate);
  };

  // Best = lowest difficulty rank, ties broken by pool order. `allowEasy=false`
  // skips 简单 problems once the day has hit its cap.
  const bestMatch = (matches: (candidate: T) => boolean, allowEasy: boolean) => {
    let best: T | undefined;
    let bestRank = Infinity;
    for (const candidate of pool) {
      if (used.has(candidate.id)) continue;
      if (!allowEasy && candidate.difficulty === "EASY") continue;
      if (!matches(candidate)) continue;
      const rank = difficultyRank(candidate.difficulty);
      if (rank < bestRank) {
        best = candidate;
        bestRank = rank;
        if (rank === 0) break; // 中等，不会有更好的了
      }
    }
    return best;
  };

  for (const category of priorityCategories) {
    if (picks.length >= count) break;
    const hit = bestMatch(
      (candidate) => topicForFrontendId(candidate.frontendId) === category,
      easyCount < EASY_PER_DAY,
    );
    if (hit) take(hit);
  }

  while (picks.length < count) {
    const fresh = bestMatch(
      (candidate) => !usedCategories.has(topicForFrontendId(candidate.frontendId)),
      easyCount < EASY_PER_DAY,
    );
    if (!fresh) break;
    take(fresh);
  }

  // Last resort: quota beats the difficulty mix, so this pass drops both the
  // category and the easy-cap constraints rather than leaving the day short.
  while (picks.length < count) {
    const any = bestMatch(() => true, easyCount < EASY_PER_DAY) ?? bestMatch(() => true, true);
    if (!any) break;
    take(any);
  }

  return picks;
}
