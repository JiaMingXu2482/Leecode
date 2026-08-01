// 牛客「华为机试」题单 HJ1–HJ108（华为机考真题沉淀，全 ACM 模式）。
// 抓取自 https://www.nowcoder.com/exam/oj/ta?tpId=37
//
// 内部 frontendId = NOWCODER_ID_BASE + HJ 编号，保证和 LeetCode 题号不冲突；
// 界面显示的是 displayId（"HJ14"）。

export const NOWCODER_ID_BASE = 10000;

export function nowcoderFrontendId(hjNumber: number) {
  return NOWCODER_ID_BASE + hjNumber;
}

export function isNowcoderFrontendId(frontendId: number) {
  return frontendId > NOWCODER_ID_BASE;
}

// [HJ编号, 标题, 牛客 practice hash, 难度, 分类]
export const NOWCODER_PROBLEMS: [number, string, string, "EASY" | "MEDIUM" | "HARD", string][] = [
  [1, "字符串最后一个单词的长度", "8c949ea5f36f422594b306a2300315da", "EASY", "字符串"],
  [2, "计算某字符出现次数", "a35ce98431874e3a820dbe4b2d0508b1", "MEDIUM", "字符串"],
  [3, "明明的随机数", "3245215fffb84b7b81285493eae92ff0", "MEDIUM", "数组"],
  [4, "字符串分隔", "d9162298cb5a437aad722fccccaae8a7", "EASY", "字符串"],
  [5, "进制转换", "8f3df50d2b9043208c5eed283d1d4da6", "EASY", "字符串"],
  [6, "质数因子", "196534628ca6490ebce2e336b47b3607", "EASY", "排序"],
  [7, "取近似值", "3ab09737afb645cc82c35d56a5ce802a", "EASY", "数学"],
  [8, "合并表记录", "de044e89123f4a7482bd2b214a685201", "EASY", "哈希"],
  [9, "提取不重复的整数", "253986e66d114d378ae8de2e6c4577c1", "MEDIUM", "数组"],
  [10, "字符个数统计", "eb94f6a5b2ba49c6ac72d40b5ce95f50", "MEDIUM", "字符串"],
  [11, "数字颠倒", "ae809795fca34687a48b172186e3dafe", "EASY", "字符串"],
  [12, "字符串反转", "e45e078701ab4e4cb49393ae30f1bb04", "EASY", "字符串"],
  [13, "句子逆序", "48b3cb4e3c694d9da5526e6255bb73c3", "EASY", "数组"],
  [14, "字符串排序", "5af18ba2eb45443aa91a11e848aa6723", "MEDIUM", "字符串"],
  [15, "求int型正整数在内存中存储时1的个数", "440f16e490a0404786865e99c6ad91c9", "EASY", "位运算"],
  [16, "购物单", "f9c6f980eeec43ef85be20755ddbeaf4", "MEDIUM", "动态规划"],
  [17, "坐标移动", "119bcca3befb405fbe58abe9c532eb29", "MEDIUM", "字符串"],
  [18, "识别有效的IP地址和掩码并进行分类统计", "de538edd6f7e4bc3a5689723a7435682", "MEDIUM", "字符串"],
  [19, "简单错误记录", "2baa6aba39214d6ea91a2e03dff3fbeb", "MEDIUM", "字符串"],
  [20, "密码验证合格程序", "184edec193864f0985ad2684fbc86841", "MEDIUM", "数组"],
  [21, "简单密码", "7960b5038a2142a18e27e4c733855dac", "MEDIUM", "字符串"],
  [22, "汽水瓶", "fe298c55694f4ed39e256170ff2c205f", "EASY", "模拟"],
  [23, "删除字符串中出现次数最少的字符", "05182d328eb848dda7fdd5e029a56da9", "MEDIUM", "字符串"],
  [24, "合唱队", "6d9d69e3898f45169a441632b325c7b4", "MEDIUM", "栈与队列"],
  [25, "数据分类处理", "9a763ed59c7243bd8ab706b2da52b7fd", "MEDIUM", "哈希"],
  [26, "字符串排序", "5190a1db6f4f4ddb92fd9c365c944584", "MEDIUM", "字符串"],
  [27, "查找兄弟单词", "03ba8aeeef73400ca7a37a5f3370fe68", "MEDIUM", "字符串"],
  [28, "素数伴侣", "b9eae162e02f4f928eac37d7699b352e", "HARD", "排序"],
  [29, "字符串加解密", "2aa32b378a024755a3f251e75cbf233a", "MEDIUM", "字符串"],
  [30, "字符串合并处理", "d3d8e23870584782b3dd48f26cb39c8f", "MEDIUM", "字符串"],
  [31, "单词倒排", "81544a4989df4109b33c2d65037c5836", "MEDIUM", "字符串"],
  [32, "密码截取", "3cd4621963e8454594f00199f4536bb1", "MEDIUM", "字符串"],
  [33, "整数与IP地址间的转换", "66ca0e28f90c42a196afd78cc9c496ea", "MEDIUM", "字符串"],
  [34, "图片整理", "2de4127fda5e46858aa85d254af43941", "MEDIUM", "字符串"],
  [35, "蛇形矩阵", "649b210ef44446e3b1cd1be6fa4cab5e", "EASY", "数组"],
  [36, "字符串加密", "e4af1fe682b54459b2a211df91a91cf3", "MEDIUM", "字符串"],
  [37, "统计每个月兔子的总数", "1221ec77125d4370833fd3ad5ba72395", "EASY", "排序"],
  [38, "求小球落地5次后所经历的路程和第5次反弹的高度", "2f6f9339d151410583459847ecc98446", "MEDIUM", "模拟"],
  [39, "判断两个IP是否属于同一子网", "34a597ee15eb4fa2b956f4c595f03218", "MEDIUM", "字符串"],
  [40, "统计字符", "539054b4c33b4776bc350155f7abd8f5", "MEDIUM", "字符串"],
  [41, "称砝码", "f9a4c19050fc477e9e27eb75f3bfd49c", "MEDIUM", "字符串"],
  [42, "构造C的歪", "56735b3fe2fc4ed5916f5427dc787156", "EASY", "数学"],
  [43, "迷宫问题", "cf24906056f4488c9ddb132f317e03bc", "MEDIUM", "递归与搜索"],
  [44, "Sudoku", "78a1a4ebe8a34c93aac006c44f6bf8a1", "HARD", "数学"],
  [45, "名字的漂亮度", "02cb8d3597cf416d9f6ae1b9ddc4fde3", "MEDIUM", "字符串"],
  [46, "截取字符串", "a30bbc1a0aca4c27b86dd88868de4a4a", "MEDIUM", "字符串"],
  [47, "【模板】排序", "40bf74658879460bbf5f1bfe772e8580", "EASY", "排序"],
  [48, "从单向链表中删除指定值的节点", "f96cd47e812842269058d483a11ced4f", "MEDIUM", "链表"],
  [49, "分数线划定", "2395fa7b6c6e452e8d8310a7cfdbe902", "EASY", "排序"],
  [50, "四则运算", "9999764a61484d819056f807d2a91f1e", "MEDIUM", "字符串"],
  [51, "输出单向链表中倒数第k个结点", "54404a78aec1435a81150f15f899417d", "MEDIUM", "链表"],
  [52, "计算字符串的编辑距离", "3959837097c7413a961a135d7104c314", "MEDIUM", "字符串"],
  [53, "杨辉三角的变形", "8ef655edf42d4e08b44be4d777edbf43", "EASY", "数学"],
  [54, "不要三句号的歪", "7cbb7d96fb354f7995d9af1ccf8906b4", "EASY", "模拟"],
  [55, "挑7", "ba241b85371c409ea01ac0aa1a8d957b", "MEDIUM", "数学"],
  [56, "完全数计算", "7299c12e6abb437c87ad3e712383ff84", "EASY", "数学"],
  [57, "高精度整数加法", "49e772ab08994a96980f9618892e55b6", "MEDIUM", "字符串"],
  [58, "输入n个整数，输出其中最小的k个", "69ef2267aafd4d52b250a272fd27052c", "MEDIUM", "数组"],
  [59, "找出字符串中第一个只出现一次的字符", "e896d0f82f1246a3aa7b232ce38029d4", "MEDIUM", "字符串"],
  [60, "查找组成一个偶数最接近的两个素数", "f8538f9ae3f1484fb137789dec6eedb9", "MEDIUM", "数学"],
  [61, "放苹果", "bfd8234bb5e84be0b493656e390bdebf", "MEDIUM", "递归与搜索"],
  [62, "查找输入整数二进制中1的个数", "1b46eb4cf3fa49b9965ac3c2c1caf5ad", "EASY", "位运算"],
  [63, "DNA序列", "e8480ed7501640709354db1cc4ffd42a", "MEDIUM", "字符串"],
  [64, "MP3光标位置", "eaf5b886bd6645dd9cfb5406f3753e15", "MEDIUM", "数组"],
  [65, "查找两个字符串a,b中的最长公共子串", "181a1a71c7574266ad07f9739f791506", "MEDIUM", "字符串"],
  [66, "配置文件恢复", "ca6ac6ef9538419abf6f883f7d6f6ee5", "MEDIUM", "字符串"],
  [67, "24点游戏算法", "fbc417f314f745b1978fc751a54ac8cb", "MEDIUM", "递归与搜索"],
  [68, "成绩排序", "8e400fd9905747e4acc2aeed7240978b", "MEDIUM", "排序"],
  [69, "矩阵乘法", "ebe941260f8c4210aa8c17e99cbc663b", "MEDIUM", "数组"],
  [70, "矩阵乘法计算量估算", "15e41630514445719a942e004edc0a5b", "MEDIUM", "字符串"],
  [71, "字符串通配符", "43072d50a6eb44d2a6c816a283b02036", "MEDIUM", "字符串"],
  [72, "百钱买百鸡问题", "74c493f094304ea2bda37d0dc40dc85b", "EASY", "数学"],
  [73, "计算日期到天数转换", "769d45d455fe40b385ba32f97e7bcded", "EASY", "字符串"],
  [74, "参数解析", "668603dc307e4ef4bb07bcd0615ea677", "MEDIUM", "字符串"],
  [75, "公共子串计算", "98dc82c094e043ccb7e0570e5342dd1b", "MEDIUM", "字符串"],
  [76, "尼科彻斯定理", "dbace3a5b3c4480e86ee3277f3fe1e85", "EASY", "数学"],
  [77, "火车进站", "97ba57c35e9f4749826dc3befaeae109", "MEDIUM", "栈与队列"],
  [78, "小苯送礼物", "466e02d2177845589ab5fa5decc2857f", "MEDIUM", "排序"],
  [79, "支付宝消费打折", "f8997c9b82714f058e12433a32614993", "MEDIUM", "排序"],
  [80, "整型数组合并", "c4f11ea2c886429faf91decfaf6a310b", "MEDIUM", "数组"],
  [81, "字符串字符匹配", "22fdeb9610ef426f9505e3ab60164c93", "MEDIUM", "字符串"],
  [82, "将真分数分解为埃及分数", "e0480b2c6aa24bfba0935ffcca3ccb7b", "MEDIUM", "数学"],
  [83, "仰望水面的歪", "69f00fb8b2004e039097c57b43c33b90", "MEDIUM", "模拟"],
  [84, "统计大写字母个数", "434414efe5ea48e5b06ebf2b35434a9c", "EASY", "字符串"],
  [85, "最长回文子串", "12e081cd10ee4794a2bd70c7d68f5507", "MEDIUM", "字符串"],
  [86, "求最大连续bit数", "4b1658fd8ffb4217bc3b7e85a38cfaf2", "EASY", "位运算"],
  [87, "密码强度等级", "52d382c2a7164767bca2064c1c9d5361", "MEDIUM", "字符串"],
  [88, "扑克牌大小", "d290db02bacc4c40965ac31d16b1c3eb", "MEDIUM", "字符串"],
  [89, "24点运算", "7e124483271e4c979a82eb2956544f9d", "MEDIUM", "字符串"],
  [90, "合法IP", "995b8a548827494699dc38c3e2a54ee9", "MEDIUM", "字符串"],
  [91, "走方格的方案数", "e2a22f0305eb4f2f9846e7d644dba09b", "MEDIUM", "动态规划"],
  [92, "在字符串中找出连续最长的数字串", "2c81f88ecd5a4cc395b5308a99afbbec", "MEDIUM", "字符串"],
  [93, "数组分组", "9af744a3517440508dbeb297020aca86", "MEDIUM", "字符串"],
  [94, "记票统计", "3350d379a5d44054b219de7af6708894", "EASY", "哈希"],
  [95, "小心火烛的歪", "6cdb80dbb66c42eea179068a4afb25db", "EASY", "模拟"],
  [96, "表示数字", "637062df51674de8ba464e792d1a0ac6", "MEDIUM", "字符串"],
  [97, "记负均正", "6abde6ffcc354ea1a8333836bd6876b8", "EASY", "数组"],
  [98, "喜欢切数组的红", "74cb703f25dc4956acb3b08028a1f4b4", "MEDIUM", "动态规划"],
  [99, "自守数", "88ddd31618f04514ae3a689e83f3ab8e", "EASY", "数学"],
  [100, "等差数列", "f792cb014ed0474fb8f53389e7d9c07f", "EASY", "数学"],
  [101, "输入整型数组和排序标识，对其元素按照升序或降序进行排序", "dd0c6b26c9e541f5b935047ff4156309", "EASY", "排序"],
  [102, "字符统计", "c1f9561de1e240099bdb904765da9ad0", "MEDIUM", "字符串"],
  [103, "Redraiment的走法", "24e6243b9f0446b081b1d6d32f2aa3aa", "MEDIUM", "排序"],
  [104, "小红的矩阵染色", "f8b771318bb04490b7389cc35e148166", "MEDIUM", "贪心"],
  [105, "研究red子序列的红", "804f995a0795419c832e1ea8e2a2aa06", "MEDIUM", "其他"],
  [106, "字符逆序", "cc57022cb4194697ac30bcb566aeb47b", "EASY", "字符串"],
  [107, "构造A+B", "953806d9f41a4d5fbbab002ed61923ff", "EASY", "模拟"],
  [108, "求最小公倍数", "22948c2cad484e0291350abad86136c3", "MEDIUM", "递归与搜索"],
];

// 分类树，刷题计划页按这个分组展示（和 Hot100 的 TOPIC_GROUPS 平行）
export const NOWCODER_TOPIC_GROUPS: { name: string; ids: number[] }[] = [
  { name: "字符串", ids: [1, 2, 4, 5, 10, 11, 12, 14, 17, 18, 19, 21, 23, 26, 27, 29, 30, 31, 32, 33, 34, 36, 39, 40, 41, 45, 46, 50, 52, 57, 59, 63, 65, 66, 70, 71, 73, 74, 75, 81, 84, 85, 87, 88, 89, 90, 92, 93, 96, 102, 106] },
  { name: "数学", ids: [7, 42, 44, 53, 55, 56, 60, 72, 76, 82, 99, 100] },
  { name: "数组", ids: [3, 9, 13, 20, 35, 58, 64, 69, 80, 97] },
  { name: "排序", ids: [6, 28, 37, 47, 49, 68, 78, 79, 101, 103] },
  { name: "模拟", ids: [22, 38, 54, 83, 95, 107] },
  { name: "递归与搜索", ids: [43, 61, 67, 108] },
  { name: "哈希", ids: [8, 25, 94] },
  { name: "位运算", ids: [15, 62, 86] },
  { name: "动态规划", ids: [16, 91, 98] },
  { name: "栈与队列", ids: [24, 77] },
  { name: "链表", ids: [48, 51] },
  { name: "贪心", ids: [104] },
  { name: "其他", ids: [105] },
];

const NC_TOPIC_BY_ID = new Map<number, string>();
const NC_TOPIC_INDEX = new Map<string, number>();
NOWCODER_TOPIC_GROUPS.forEach((group, index) => {
  NC_TOPIC_INDEX.set(group.name, index);
  for (const id of group.ids) {
    NC_TOPIC_BY_ID.set(id, group.name);
  }
});

// 传入 HJ 编号（不是 frontendId）
export function nowcoderTopicForHj(hjNumber: number): string {
  return NC_TOPIC_BY_ID.get(hjNumber) ?? "其他";
}

export function nowcoderTopicOrder(name: string): number {
  return NC_TOPIC_INDEX.get(name) ?? NOWCODER_TOPIC_GROUPS.length;
}
