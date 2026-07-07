import { describe, expect, it } from "vitest";
import { orderDailyNewPicks } from "./new-problem-picker";

// Category membership (from TOPIC_GROUPS): 回溯 → 46/78/17…, 贪心算法 → 121/55…,
// 动态规划 → 70/118…, 哈希 → 1/49/128, 双指针 → 283…
function candidate(id: string, frontendId: number) {
  return { id, frontendId, estimatedNewMinutes: 40 };
}

const PRIORITY = ["回溯", "贪心算法", "动态规划"];

describe("orderDailyNewPicks", () => {
  it("takes one problem from each priority category, then fills by pool order", () => {
    const pool = [
      candidate("hash-1", 1), // 哈希 — first in Hot100 order
      candidate("bt-46", 46), // 回溯
      candidate("bt-78", 78), // 回溯 (second in category, should NOT be picked)
      candidate("greedy-121", 121), // 贪心算法
      candidate("dp-70", 70), // 动态规划
    ];
    const picks = orderDailyNewPicks(pool, PRIORITY, 4);
    expect(picks.map((p) => p.id)).toEqual(["bt-46", "greedy-121", "dp-70", "hash-1"]);
  });

  it("backfills from pool order when a priority category is exhausted", () => {
    const pool = [
      candidate("hash-1", 1),
      candidate("hash-49", 49),
      candidate("greedy-55", 55),
      candidate("dp-118", 118),
    ];
    // 回溯 has nothing left → 3 priority slots yield 2, backfill by order.
    const picks = orderDailyNewPicks(pool, PRIORITY, 4);
    expect(picks.map((p) => p.id)).toEqual(["greedy-55", "dp-118", "hash-1", "hash-49"]);
  });

  it("respects the count and never duplicates a candidate", () => {
    const pool = [candidate("bt-46", 46), candidate("greedy-121", 121)];
    const picks = orderDailyNewPicks(pool, PRIORITY, 4);
    expect(picks.map((p) => p.id)).toEqual(["bt-46", "greedy-121"]);
    expect(orderDailyNewPicks(pool, PRIORITY, 1).map((p) => p.id)).toEqual(["bt-46"]);
  });

  it("uses plain pool order when no priority categories are set", () => {
    const pool = [candidate("hash-1", 1), candidate("bt-46", 46)];
    expect(orderDailyNewPicks(pool, [], 2).map((p) => p.id)).toEqual(["hash-1", "bt-46"]);
  });
});
