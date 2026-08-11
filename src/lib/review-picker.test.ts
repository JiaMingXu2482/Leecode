import { describe, expect, it } from "vitest";
import { orderTopicMatchedReviews } from "./review-picker";

// Hot100 分类速查：70 动态规划 / 62 多维动态规划 / 121 贪心算法 / 46 回溯 / 20 栈
function candidate(id: string, frontendId: number, avgFeelingScore: number | null = null, dueDaysAgo = 0) {
  return {
    problemId: id,
    frontendId,
    estimatedReviewMinutes: 25,
    nextReviewDate: new Date(Date.UTC(2026, 7, 10 - dueDaysAgo)),
    avgFeelingScore,
  };
}

describe("orderTopicMatchedReviews", () => {
  it("考点匹配的排在前面，不匹配的垫底", () => {
    const picks = orderTopicMatchedReviews(
      [candidate("greedy-121", 121), candidate("dp-70", 70), candidate("dp2-62", 62)],
      ["动态规划"],
      3,
    );
    // 动态规划(首选) → 多维动态规划(次选) → 贪心算法(没匹配上)
    expect(picks.map((p) => p.problemId)).toEqual(["dp-70", "dp2-62", "greedy-121"]);
  });

  it("同一考点内，越不熟的越先复习", () => {
    const picks = orderTopicMatchedReviews(
      [candidate("easy-70", 70, 0.5), candidate("shaky-118", 118, 3.8), candidate("mid-198", 198, 2)],
      ["动态规划"],
      3,
    );
    expect(picks.map((p) => p.problemId)).toEqual(["shaky-118", "mid-198", "easy-70"]);
  });

  it("没评过分的题排在「明显不熟」和「明显掌握」之间", () => {
    const picks = orderTopicMatchedReviews(
      [candidate("never-70", 70, null), candidate("weak-118", 118, 4), candidate("solid-198", 198, 1)],
      ["动态规划"],
      3,
    );
    expect(picks.map((p) => p.problemId)).toEqual(["weak-118", "never-70", "solid-198"]);
  });

  it("熟练度相同时，过期越久的越先来", () => {
    const picks = orderTopicMatchedReviews(
      [candidate("fresh-70", 70, 2, 1), candidate("stale-118", 118, 2, 30)],
      ["动态规划"],
      2,
    );
    expect(picks.map((p) => p.problemId)).toEqual(["stale-118", "fresh-70"]);
  });

  it("尊重条数上限", () => {
    const picks = orderTopicMatchedReviews(
      [candidate("dp-70", 70), candidate("dp-118", 118), candidate("dp-198", 198)],
      ["动态规划"],
      2,
    );
    expect(picks).toHaveLength(2);
  });

  it("count 为 0 时什么都不排", () => {
    expect(orderTopicMatchedReviews([candidate("dp-70", 70)], ["动态规划"], 0)).toEqual([]);
  });

  it("当天没有可匹配的考点时仍然按熟练度补满", () => {
    const picks = orderTopicMatchedReviews(
      [candidate("solid-70", 70, 1), candidate("weak-121", 121, 4)],
      [],
      2,
    );
    expect(picks.map((p) => p.problemId)).toEqual(["weak-121", "solid-70"]);
  });

  it("不修改传入的数组", () => {
    const pool = [candidate("greedy-121", 121), candidate("dp-70", 70)];
    orderTopicMatchedReviews(pool, ["动态规划"], 2);
    expect(pool.map((p) => p.problemId)).toEqual(["greedy-121", "dp-70"]);
  });
});
