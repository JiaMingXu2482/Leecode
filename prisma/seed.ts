import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const problems = [
  [1, "Two Sum", "两数之和", "two-sum", "EASY", "数组,哈希表"],
  [49, "Group Anagrams", "字母异位词分组", "group-anagrams", "MEDIUM", "数组,哈希表,字符串,排序"],
  [128, "Longest Consecutive Sequence", "最长连续序列", "longest-consecutive-sequence", "MEDIUM", "并查集,数组,哈希表"],
  [283, "Move Zeroes", "移动零", "move-zeroes", "EASY", "数组,双指针"],
  [11, "Container With Most Water", "盛最多水的容器", "container-with-most-water", "MEDIUM", "贪心,数组,双指针"],
  [15, "3Sum", "三数之和", "3sum", "MEDIUM", "数组,双指针,排序"],
  [42, "Trapping Rain Water", "接雨水", "trapping-rain-water", "HARD", "栈,数组,双指针,动态规划"],
  [3, "Longest Substring Without Repeating Characters", "无重复字符的最长子串", "longest-substring-without-repeating-characters", "MEDIUM", "哈希表,字符串,滑动窗口"],
  [438, "Find All Anagrams in a String", "找到字符串中所有字母异位词", "find-all-anagrams-in-a-string", "MEDIUM", "哈希表,字符串,滑动窗口"],
  [560, "Subarray Sum Equals K", "和为 K 的子数组", "subarray-sum-equals-k", "MEDIUM", "数组,哈希表,前缀和"],
  [239, "Sliding Window Maximum", "滑动窗口最大值", "sliding-window-maximum", "HARD", "队列,数组,滑动窗口,单调队列"],
  [76, "Minimum Window Substring", "最小覆盖子串", "minimum-window-substring", "HARD", "哈希表,字符串,滑动窗口"],
  [53, "Maximum Subarray", "最大子数组和", "maximum-subarray", "MEDIUM", "数组,分治,动态规划"],
  [56, "Merge Intervals", "合并区间", "merge-intervals", "MEDIUM", "数组,排序"],
  [189, "Rotate Array", "轮转数组", "rotate-array", "MEDIUM", "数组,数学,双指针"],
  [238, "Product of Array Except Self", "除自身以外数组的乘积", "product-of-array-except-self", "MEDIUM", "数组,前缀和"],
  [41, "First Missing Positive", "缺失的第一个正数", "first-missing-positive", "HARD", "数组,哈希表"],
  [73, "Set Matrix Zeroes", "矩阵置零", "set-matrix-zeroes", "MEDIUM", "数组,哈希表,矩阵"],
  [54, "Spiral Matrix", "螺旋矩阵", "spiral-matrix", "MEDIUM", "数组,矩阵,模拟"],
  [48, "Rotate Image", "旋转图像", "rotate-image", "MEDIUM", "数组,数学,矩阵"],
  [240, "Search a 2D Matrix II", "搜索二维矩阵 II", "search-a-2d-matrix-ii", "MEDIUM", "数组,二分查找,分治,矩阵"],
  [160, "Intersection of Two Linked Lists", "相交链表", "intersection-of-two-linked-lists", "EASY", "哈希表,链表,双指针"],
  [206, "Reverse Linked List", "反转链表", "reverse-linked-list", "EASY", "递归,链表"],
  [234, "Palindrome Linked List", "回文链表", "palindrome-linked-list", "EASY", "栈,递归,链表,双指针"],
  [141, "Linked List Cycle", "环形链表", "linked-list-cycle", "EASY", "哈希表,链表,双指针"],
  [142, "Linked List Cycle II", "环形链表 II", "linked-list-cycle-ii", "MEDIUM", "哈希表,链表,双指针"],
  [21, "Merge Two Sorted Lists", "合并两个有序链表", "merge-two-sorted-lists", "EASY", "递归,链表"],
  [2, "Add Two Numbers", "两数相加", "add-two-numbers", "MEDIUM", "递归,链表,数学"],
  [19, "Remove Nth Node From End of List", "删除链表的倒数第 N 个结点", "remove-nth-node-from-end-of-list", "MEDIUM", "链表,双指针"],
  [24, "Swap Nodes in Pairs", "两两交换链表中的节点", "swap-nodes-in-pairs", "MEDIUM", "递归,链表"],
  [25, "Reverse Nodes in k-Group", "K 个一组翻转链表", "reverse-nodes-in-k-group", "HARD", "递归,链表"],
  [138, "Copy List with Random Pointer", "随机链表的复制", "copy-list-with-random-pointer", "MEDIUM", "哈希表,链表"],
  [148, "Sort List", "排序链表", "sort-list", "MEDIUM", "链表,双指针,分治,排序"],
  [23, "Merge k Sorted Lists", "合并 K 个升序链表", "merge-k-sorted-lists", "HARD", "链表,分治,堆"],
  [146, "LRU Cache", "LRU 缓存", "lru-cache", "MEDIUM", "设计,哈希表,链表,双向链表"],
  [94, "Binary Tree Inorder Traversal", "二叉树的中序遍历", "binary-tree-inorder-traversal", "EASY", "栈,树,深度优先搜索,二叉树"],
  [104, "Maximum Depth of Binary Tree", "二叉树的最大深度", "maximum-depth-of-binary-tree", "EASY", "树,深度优先搜索,广度优先搜索,二叉树"],
  [226, "Invert Binary Tree", "翻转二叉树", "invert-binary-tree", "EASY", "树,深度优先搜索,广度优先搜索,二叉树"],
  [101, "Symmetric Tree", "对称二叉树", "symmetric-tree", "EASY", "树,深度优先搜索,广度优先搜索,二叉树"],
  [543, "Diameter of Binary Tree", "二叉树的直径", "diameter-of-binary-tree", "EASY", "树,深度优先搜索,二叉树"],
  [102, "Binary Tree Level Order Traversal", "二叉树的层序遍历", "binary-tree-level-order-traversal", "MEDIUM", "树,广度优先搜索,二叉树"],
  [108, "Convert Sorted Array to Binary Search Tree", "将有序数组转换为二叉搜索树", "convert-sorted-array-to-binary-search-tree", "EASY", "树,二叉搜索树,数组,分治"],
  [98, "Validate Binary Search Tree", "验证二叉搜索树", "validate-binary-search-tree", "MEDIUM", "树,深度优先搜索,二叉搜索树,二叉树"],
  [230, "Kth Smallest Element in a BST", "二叉搜索树中第 K 小的元素", "kth-smallest-element-in-a-bst", "MEDIUM", "树,深度优先搜索,二叉搜索树"],
  [199, "Binary Tree Right Side View", "二叉树的右视图", "binary-tree-right-side-view", "MEDIUM", "树,深度优先搜索,广度优先搜索"],
  [114, "Flatten Binary Tree to Linked List", "二叉树展开为链表", "flatten-binary-tree-to-linked-list", "MEDIUM", "栈,树,深度优先搜索,链表"],
  [105, "Construct Binary Tree from Preorder and Inorder Traversal", "从前序与中序遍历序列构造二叉树", "construct-binary-tree-from-preorder-and-inorder-traversal", "MEDIUM", "树,数组,哈希表,分治"],
  [437, "Path Sum III", "路径总和 III", "path-sum-iii", "MEDIUM", "树,深度优先搜索,二叉树"],
  [236, "Lowest Common Ancestor of a Binary Tree", "二叉树的最近公共祖先", "lowest-common-ancestor-of-a-binary-tree", "MEDIUM", "树,深度优先搜索,二叉树"],
  [124, "Binary Tree Maximum Path Sum", "二叉树中的最大路径和", "binary-tree-maximum-path-sum", "HARD", "树,深度优先搜索,动态规划"],
  [200, "Number of Islands", "岛屿数量", "number-of-islands", "MEDIUM", "深度优先搜索,广度优先搜索,并查集,矩阵"],
  [994, "Rotting Oranges", "腐烂的橘子", "rotting-oranges", "MEDIUM", "广度优先搜索,数组,矩阵"],
  [207, "Course Schedule", "课程表", "course-schedule", "MEDIUM", "图,拓扑排序,深度优先搜索,广度优先搜索"],
  [208, "Implement Trie (Prefix Tree)", "实现 Trie 前缀树", "implement-trie-prefix-tree", "MEDIUM", "设计,字典树,哈希表,字符串"],
  [46, "Permutations", "全排列", "permutations", "MEDIUM", "数组,回溯"],
  [78, "Subsets", "子集", "subsets", "MEDIUM", "位运算,数组,回溯"],
  [17, "Letter Combinations of a Phone Number", "电话号码的字母组合", "letter-combinations-of-a-phone-number", "MEDIUM", "哈希表,字符串,回溯"],
  [39, "Combination Sum", "组合总和", "combination-sum", "MEDIUM", "数组,回溯"],
  [22, "Generate Parentheses", "括号生成", "generate-parentheses", "MEDIUM", "字符串,动态规划,回溯"],
  [79, "Word Search", "单词搜索", "word-search", "MEDIUM", "数组,回溯,矩阵"],
  [131, "Palindrome Partitioning", "分割回文串", "palindrome-partitioning", "MEDIUM", "字符串,动态规划,回溯"],
  [51, "N-Queens", "N 皇后", "n-queens", "HARD", "数组,回溯"],
  [35, "Search Insert Position", "搜索插入位置", "search-insert-position", "EASY", "数组,二分查找"],
  [74, "Search a 2D Matrix", "搜索二维矩阵", "search-a-2d-matrix", "MEDIUM", "数组,二分查找,矩阵"],
  [34, "Find First and Last Position of Element in Sorted Array", "在排序数组中查找元素的第一个和最后一个位置", "find-first-and-last-position-of-element-in-sorted-array", "MEDIUM", "数组,二分查找"],
  [33, "Search in Rotated Sorted Array", "搜索旋转排序数组", "search-in-rotated-sorted-array", "MEDIUM", "数组,二分查找"],
  [153, "Find Minimum in Rotated Sorted Array", "寻找旋转排序数组中的最小值", "find-minimum-in-rotated-sorted-array", "MEDIUM", "数组,二分查找"],
  [4, "Median of Two Sorted Arrays", "寻找两个正序数组的中位数", "median-of-two-sorted-arrays", "HARD", "数组,二分查找,分治"],
  [20, "Valid Parentheses", "有效的括号", "valid-parentheses", "EASY", "栈,字符串"],
  [155, "Min Stack", "最小栈", "min-stack", "MEDIUM", "栈,设计"],
  [394, "Decode String", "字符串解码", "decode-string", "MEDIUM", "栈,递归,字符串"],
  [739, "Daily Temperatures", "每日温度", "daily-temperatures", "MEDIUM", "栈,数组,单调栈"],
  [84, "Largest Rectangle in Histogram", "柱状图中最大的矩形", "largest-rectangle-in-histogram", "HARD", "栈,数组,单调栈"],
  [215, "Kth Largest Element in an Array", "数组中的第 K 个最大元素", "kth-largest-element-in-an-array", "MEDIUM", "数组,分治,快速选择,堆"],
  [347, "Top K Frequent Elements", "前 K 个高频元素", "top-k-frequent-elements", "MEDIUM", "数组,哈希表,分治,堆"],
  [295, "Find Median from Data Stream", "数据流的中位数", "find-median-from-data-stream", "HARD", "设计,双指针,数据流,堆"],
  [121, "Best Time to Buy and Sell Stock", "买卖股票的最佳时机", "best-time-to-buy-and-sell-stock", "EASY", "数组,动态规划"],
  [55, "Jump Game", "跳跃游戏", "jump-game", "MEDIUM", "贪心,数组,动态规划"],
  [45, "Jump Game II", "跳跃游戏 II", "jump-game-ii", "MEDIUM", "贪心,数组,动态规划"],
  [763, "Partition Labels", "划分字母区间", "partition-labels", "MEDIUM", "贪心,哈希表,双指针,字符串"],
  [70, "Climbing Stairs", "爬楼梯", "climbing-stairs", "EASY", "记忆化搜索,数学,动态规划"],
  [118, "Pascal's Triangle", "杨辉三角", "pascals-triangle", "EASY", "数组,动态规划"],
  [198, "House Robber", "打家劫舍", "house-robber", "MEDIUM", "数组,动态规划"],
  [279, "Perfect Squares", "完全平方数", "perfect-squares", "MEDIUM", "广度优先搜索,数学,动态规划"],
  [322, "Coin Change", "零钱兑换", "coin-change", "MEDIUM", "广度优先搜索,数组,动态规划"],
  [139, "Word Break", "单词拆分", "word-break", "MEDIUM", "字典树,记忆化搜索,数组,哈希表,动态规划"],
  [300, "Longest Increasing Subsequence", "最长递增子序列", "longest-increasing-subsequence", "MEDIUM", "数组,二分查找,动态规划"],
  [152, "Maximum Product Subarray", "乘积最大子数组", "maximum-product-subarray", "MEDIUM", "数组,动态规划"],
  [416, "Partition Equal Subset Sum", "分割等和子集", "partition-equal-subset-sum", "MEDIUM", "数组,动态规划"],
  [32, "Longest Valid Parentheses", "最长有效括号", "longest-valid-parentheses", "HARD", "栈,字符串,动态规划"],
  [62, "Unique Paths", "不同路径", "unique-paths", "MEDIUM", "数学,动态规划,组合数学"],
  [64, "Minimum Path Sum", "最小路径和", "minimum-path-sum", "MEDIUM", "数组,动态规划,矩阵"],
  [5, "Longest Palindromic Substring", "最长回文子串", "longest-palindromic-substring", "MEDIUM", "字符串,动态规划"],
  [1143, "Longest Common Subsequence", "最长公共子序列", "longest-common-subsequence", "MEDIUM", "字符串,动态规划"],
  [72, "Edit Distance", "编辑距离", "edit-distance", "MEDIUM", "字符串,动态规划"],
  [136, "Single Number", "只出现一次的数字", "single-number", "EASY", "位运算,数组"],
  [169, "Majority Element", "多数元素", "majority-element", "EASY", "数组,哈希表,分治,计数"],
  [75, "Sort Colors", "颜色分类", "sort-colors", "MEDIUM", "数组,双指针,排序"],
  [31, "Next Permutation", "下一个排列", "next-permutation", "MEDIUM", "数组,双指针"],
  [287, "Find the Duplicate Number", "寻找重复数", "find-the-duplicate-number", "MEDIUM", "位运算,数组,双指针,二分查找"],
] as const;

function estimateNewMinutes(difficulty: string) {
  if (difficulty === "HARD") {
    return 70;
  }

  if (difficulty === "MEDIUM") {
    return 45;
  }

  return 25;
}

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  await prisma.leetCodeSyncState.upsert({
    where: { id: "leetcode-cn" },
    update: {},
    create: { id: "leetcode-cn" },
  });

  for (const [index, problem] of problems.entries()) {
    const [frontendId, title, titleCn, slug, difficulty, tags] = problem;
    const saved = await prisma.problem.upsert({
      where: { frontendId },
      update: {
        title,
        titleCn,
        slug,
        leetcodeCnUrl: `https://leetcode.cn/problems/${slug}/`,
        difficulty,
        tags,
        hot100Order: index + 1,
        estimatedNewMinutes: estimateNewMinutes(difficulty),
        estimatedReviewMinutes: difficulty === "HARD" ? 35 : difficulty === "MEDIUM" ? 25 : 15,
      },
      create: {
        frontendId,
        title,
        titleCn,
        slug,
        leetcodeCnUrl: `https://leetcode.cn/problems/${slug}/`,
        difficulty,
        tags,
        hot100Order: index + 1,
        estimatedNewMinutes: estimateNewMinutes(difficulty),
        estimatedReviewMinutes: difficulty === "HARD" ? 35 : difficulty === "MEDIUM" ? 25 : 15,
      },
    });

    await prisma.problemProgress.upsert({
      where: { problemId: saved.id },
      update: {},
      create: { problemId: saved.id },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
