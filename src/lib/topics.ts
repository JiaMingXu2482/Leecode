// Official leetcode.cn top-100-liked study-plan categories, in plan order.
// Each Hot100 problem belongs to exactly one category (counts sum to 100).
export const TOPIC_GROUPS: { name: string; ids: number[] }[] = [
  { name: "哈希", ids: [1, 49, 128] },
  { name: "双指针", ids: [283, 11, 15, 42] },
  { name: "滑动窗口", ids: [3, 438] },
  { name: "子串", ids: [560, 239, 76] },
  { name: "普通数组", ids: [53, 56, 189, 238, 41] },
  { name: "矩阵", ids: [73, 54, 48, 240] },
  { name: "链表", ids: [160, 206, 234, 141, 142, 21, 2, 19, 24, 25, 138, 148, 23, 146] },
  { name: "二叉树", ids: [94, 104, 226, 101, 543, 102, 108, 98, 230, 199, 114, 105, 437, 236, 124] },
  { name: "图论", ids: [200, 994, 207, 208] },
  { name: "回溯", ids: [46, 78, 17, 39, 22, 79, 131, 51] },
  { name: "二分查找", ids: [35, 74, 34, 33, 153, 4] },
  { name: "栈", ids: [20, 155, 394, 739, 84] },
  { name: "堆", ids: [215, 347, 295] },
  { name: "贪心算法", ids: [121, 55, 45, 763] },
  { name: "动态规划", ids: [70, 118, 198, 279, 322, 139, 300, 152, 416, 32] },
  { name: "多维动态规划", ids: [62, 64, 5, 1143, 72] },
  { name: "技巧", ids: [136, 169, 75, 31, 287] },
];

const TOPIC_BY_ID = new Map<number, string>();
const TOPIC_INDEX = new Map<string, number>();
TOPIC_GROUPS.forEach((group, index) => {
  TOPIC_INDEX.set(group.name, index);
  for (const id of group.ids) {
    TOPIC_BY_ID.set(id, group.name);
  }
});

export function topicForFrontendId(frontendId: number): string {
  return TOPIC_BY_ID.get(frontendId) ?? "其他";
}

export function topicOrder(name: string): number {
  return TOPIC_INDEX.get(name) ?? TOPIC_GROUPS.length;
}
