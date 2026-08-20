// ACM 题（速成题单 / 牛客 HJ）的考点 → Hot100 分类。
//
// 用途：每天的 Hot100 复习不再按到期日排，而是挑和当天新题考点相近的题，
// 让「今天新学的」和「今天复习的」落在同一个知识点上，一起记。用户的原话是
// 「排那些与当日做的牛客题目考点相近的 leetcode100 题目来复习，这样方便我一起记忆」。
//
// 每个数组按相关度从高到低排，第一个是最贴的分类。左边的 key 同时覆盖
// CODEFUN_PROBLEMS 和 NOWCODER_TOPIC_GROUPS 两套分类名（两边有重名的走同一条）。
// 右边只能出现 TOPIC_GROUPS 里的名字，topic-affinity.test.ts 会校验这一点。
export const HOT100_TOPICS_FOR_ACM_TOPIC: Record<string, string[]> = {
  // ── 华为题单的 19 类 ──
  动态规划: ["动态规划", "多维动态规划"],
  模拟: ["矩阵", "普通数组", "技巧"],
  贪心: ["贪心算法"],
  DFS: ["回溯", "二叉树", "图论"],
  "DFS(图论)": ["图论", "回溯"],
  "DFS(搜索)": ["回溯", "二叉树"],
  BFS: ["图论", "二叉树"],
  "双指针/滑动窗口": ["双指针", "滑动窗口", "子串"],
  二分: ["二分查找"],
  图论: ["图论"],
  并查集: ["图论"],
  数学: ["技巧"],
  栈: ["栈"],
  单调栈: ["栈", "子串"],
  队列: ["堆", "栈"],
  双端队列: ["子串", "栈"],
  优先队列: ["堆"],
  双向链表: ["链表"],
  二叉搜索树: ["二叉树"],
  哈希表: ["哈希"],
  排序: ["普通数组", "技巧"],
  树状数组: ["子串", "普通数组"],
  // ── 牛客 HJ 独有的分类 ──
  字符串: ["滑动窗口", "子串", "哈希"],
  数组与排序: ["普通数组", "技巧"],
  哈希与查找: ["哈希"],
  数学与数论: ["技巧"],
  位运算: ["技巧"],
  递归与回溯: ["回溯", "二叉树"],
  搜索: ["图论", "回溯"],
  栈与队列: ["栈", "堆"],
  链表: ["链表"],
  矩阵: ["矩阵"],
};

// Merge several ACM topics (one day holds 3-5 new problems) into one ranked
// list of Hot100 categories. A category keeps its BEST rank across the day's
// topics, so a category that's the top match for any one problem outranks a
// category that's only ever a third-choice match.
export function hot100TopicsForAcmTopics(acmTopics: Iterable<string>): string[] {
  const bestRank = new Map<string, number>();
  for (const acmTopic of acmTopics) {
    const matches = HOT100_TOPICS_FOR_ACM_TOPIC[acmTopic];
    if (!matches) {
      continue;
    }
    matches.forEach((name, index) => {
      const current = bestRank.get(name);
      if (current === undefined || index < current) {
        bestRank.set(name, index);
      }
    });
  }
  return [...bestRank.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
}
