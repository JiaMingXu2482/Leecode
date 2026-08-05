import { describe, expect, it } from "vitest";
import { orderDailyNewPicks } from "./new-problem-picker";

// Category membership (from TOPIC_GROUPS): 回溯 → 46/78/17…, 贪心算法 → 121/55…,
// 动态规划 → 70/118…, 哈希 → 1/49/128, 双指针 → 283…
// Defaults to 中等 so the existing ordering tests aren't affected by the
// difficulty preference — with a uniform difficulty, pool order still wins.
function candidate(id: string, frontendId: number, difficulty = "MEDIUM", source = "NOWCODER") {
  return { id, frontendId, estimatedNewMinutes: 40, difficulty, source };
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

  it("spreads a day across different categories instead of taking the first N", () => {
    // Pool order is 哈希, 哈希, 哈希, 回溯, 动态规划 — plain order would give
    // three 哈希 problems in a row.
    const pool = [
      candidate("hash-1", 1),
      candidate("hash-49", 49),
      candidate("hash-128", 128),
      candidate("bt-46", 46),
      candidate("dp-70", 70),
    ];
    const picks = orderDailyNewPicks(pool, [], 3);
    expect(picks.map((p) => p.id)).toEqual(["hash-1", "bt-46", "dp-70"]);
  });

  it("avoids categories the day already covers when topping up in batches", () => {
    const pool = [
      candidate("hash-49", 49), // 哈希 — already on the day
      candidate("bt-46", 46), // 回溯
    ];
    // The day already has a 哈希 problem, so the top-up should skip 哈希.
    const picks = orderDailyNewPicks(pool, [], 1, ["哈希"]);
    expect(picks.map((p) => p.id)).toEqual(["bt-46"]);
  });

  it("falls back to repeating a category once distinct ones run out", () => {
    const pool = [candidate("hash-1", 1), candidate("hash-49", 49), candidate("hash-128", 128)];
    const picks = orderDailyNewPicks(pool, [], 3);
    expect(picks.map((p) => p.id)).toEqual(["hash-1", "hash-49", "hash-128"]);
  });

  describe("难度约束", () => {
    it("prefers 中等 over 简单 even when 简单 comes first in pool order", () => {
      const pool = [
        candidate("easy-1", 1, "EASY"), // 哈希，简单
        candidate("med-46", 46, "MEDIUM"), // 回溯，中等
      ];
      expect(orderDailyNewPicks(pool, [], 1).map((p) => p.id)).toEqual(["med-46"]);
    });

    it("takes at most one 简单 per day", () => {
      const pool = [
        candidate("easy-1", 1, "EASY"), // 哈希
        candidate("easy-46", 46, "EASY"), // 回溯
        candidate("easy-70", 70, "EASY"), // 动态规划
        candidate("med-283", 283, "MEDIUM"), // 双指针
        candidate("med-20", 20, "MEDIUM"), // 栈
      ];
      const picks = orderDailyNewPicks(pool, [], 3);
      const easies = picks.filter((p) => p.difficulty === "EASY");
      expect(easies).toHaveLength(1);
      // 两道中等先上，简单的只补一道
      expect(picks.map((p) => p.difficulty)).toEqual(["MEDIUM", "MEDIUM", "EASY"]);
    });

    it("counts 简单 problems already on the day against the cap", () => {
      const pool = [
        candidate("easy-1", 1, "EASY"),
        candidate("med-46", 46, "MEDIUM"),
      ];
      // 当天已经有一道简单题了，这次不该再排简单题
      const picks = orderDailyNewPicks(pool, [], 1, [], 1);
      expect(picks.map((p) => p.id)).toEqual(["med-46"]);
    });

    it("still fills the quota with 简单 when nothing else is left", () => {
      const pool = [candidate("easy-1", 1, "EASY"), candidate("easy-46", 46, "EASY")];
      // 配额优先于难度配比：宁可多排一道简单题，也不要少排
      expect(orderDailyNewPicks(pool, [], 2)).toHaveLength(2);
    });

    it("速成题单优先，且按题单顺序、不受难度限制", () => {
      const pool = [
        candidate("hj-1", 10001, "MEDIUM", "NOWCODER"),
        candidate("cf-1", 20001, "EASY", "CODEFUN"),
        candidate("cf-2", 20002, "EASY", "CODEFUN"),
        candidate("cf-3", 20003, "HARD", "CODEFUN"),
      ];
      const picks = orderDailyNewPicks(pool, PRIORITY, 3);
      // 顺序照抄题单，两道简单题也照排（放开了每天 1 道简单的限制）
      expect(picks.map((p) => p.id)).toEqual(["cf-1", "cf-2", "cf-3"]);
    });

    it("速成题单刷完后回落到牛客", () => {
      const pool = [
        candidate("hj-1", 10001, "MEDIUM", "NOWCODER"),
        candidate("hj-2", 10002, "MEDIUM", "NOWCODER"),
      ];
      expect(orderDailyNewPicks(pool, [], 2)).toHaveLength(2);
    });

    it("prefers 中等 over 困难 too", () => {
      const pool = [
        candidate("hard-1", 1, "HARD"),
        candidate("med-46", 46, "MEDIUM"),
      ];
      expect(orderDailyNewPicks(pool, [], 1).map((p) => p.id)).toEqual(["med-46"]);
    });
  });
});
