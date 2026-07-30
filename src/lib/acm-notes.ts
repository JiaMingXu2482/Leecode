import type { AcmNoteCategory } from "@/lib/acm-note-shared";
import { getDb } from "@/lib/db";

// Server-side re-exports so API routes keep a single import site.
export {
  ACM_NOTE_CATEGORIES,
  ACM_NOTE_CONTENT_LIMIT,
  ACM_NOTE_TITLE_LIMIT,
  isAcmNoteCategory,
} from "@/lib/acm-note-shared";

// Notes the knowledge base starts with, so the page is useful on day one
// instead of being an empty box. Seeded only when the table is empty; after
// that it's entirely the user's own data (edits/deletes are never overwritten).
const SEED: { title: string; category: AcmNoteCategory; content: string; isPinned: boolean }[] = [
  {
    title: "输入骨架 · 5 种常见格式",
    category: "输入输出",
    isPinned: true,
    content: `// ① 第一行 n，接下来 n 行（行内可能有空格）
int n;
cin >> n;
cin.ignore();                    // ★ 必须！吃掉 n 后面的换行
vector<string> v(n);
for (int i = 0; i < n; i++) getline(cin, v[i]);

// ② 只有一行字符串
string s;
getline(cin, s);

// ③ 行数不定，读到文件结束
string line;
while (getline(cin, line)) {
    if (line.empty()) continue;
}

// ④ 一堆数字，数量不定
int x;
while (cin >> x) { }

// ⑤ 第一行 n，接下来 n 行「字符串 数字」（字段内无空格）
int n; cin >> n;
for (int i = 0; i < n; i++) {
    string name; int score;
    cin >> name >> score;        // 不用 getline，也就不用 ignore
}`,
  },
  {
    title: "cin >> 和 getline 怎么选（判断标准）",
    category: "输入输出",
    isPinned: true,
    content: `判断标准只有一条：

    看「单个字段内部」有没有空格？

  有空格 → 必须 getline（cin >> 根本做不到，一定会在空格处断开）
  无空格 → 优先 cin >>（getline 也能做，但要自己再切一次 + 转类型，绕远路）

换个角度想：那个空格是你想丢掉的分隔符，还是要保留的数据？
  想丢 → cin >>       fang 90            空格是"栏杆"，隔开两个字段
  要留 → getline      Hello NowCoder!    空格是"货物"，是内容的一部分

─────────────────────────────────────────────
                cin >> x        getline(cin, s)
跳过前导空白     ✅ 跳(含换行)    ❌ 不跳
遇到空格         停              照读进去
遇到换行         停              停
吃掉分隔符       ❌ 留着          ✅ 吃掉
类型             任意，自动转换   只能 string
─────────────────────────────────────────────

推论：cin >> 不管换行，所以 cin >> n >> op 即使 n 和 op 在两行也能读。`,
  },
  {
    title: "cin.ignore() 什么时候非加不可",
    category: "输入输出",
    isPinned: true,
    content: `规律：cin >> 后面紧接 getline，中间必加 cin.ignore()。
反过来（getline 后接 cin >>）不用，因为 getline 已经把换行吃掉了。

原因：>> 停下时不吃分隔符，把换行留在流里；
      getline 一上来就撞见它，啥也没读到就返回空串。

    输入流:  11\\ncap\\nto\\n
    cin >> n  →  读走 "11"，停在 '\\n' 前（换行还在！）
    getline   →  当前位置就是 '\\n'  →  v[0] = ""   ❌ 全部错位

两种写法：
    cin.ignore();                                          // 简单版，丢 1 个字符
    cin.ignore(numeric_limits<streamsize>::max(), '\\n');   // 保险版，丢到行尾
                                                           // 需 #include <limits>

保险版更稳：万一数字后面跟了空格（"5   \\n"），简单版只丢掉一个空格，
换行还留着，照样出 bug。

⚠️ 但先想清楚要不要用 getline —— 如果字段内没空格，直接 cin >> 连 ignore 都不需要。`,
  },
  {
    title: "struct + 自定义 cmp 多字段排序模板",
    category: "排序比较",
    isPinned: true,
    content: `#include <algorithm>

struct Student {
    string name;
    int score;
    int idx;            // 输入顺序，用来保证"同值不换位"
};

// 读入时记住顺序
for (int i = 0; i < n; i++) {
    cin >> v[i].name >> v[i].score;
    v[i].idx = i;
}

// ── 通用骨架：从上往下，前面的定不了才轮到后面的 ──
sort(v.begin(), v.end(), [](const Student& a, const Student& b) {
    if (a.score != b.score) return a.score > b.score;   // 第一关键字（> 是降序）
    if (a.name  != b.name ) return a.name  < b.name;    // 第二关键字
    return a.idx < b.idx;                               // 兜底：保持输入顺序
});

// 需要用到外部变量（如 op 控制升降序）→ 写进捕获列表
sort(v.begin(), v.end(), [op](const Student& a, const Student& b) {
    if (a.score != b.score) {
        return op == 0 ? a.score > b.score      // 0 = 降序
                       : a.score < b.score;     // 1 = 升序
    }
    return a.idx < b.idx;
});

记三件事：
  想降序           → 把 < 换成 >
  要用外部变量     → 捕获列表写 [op]（[] 里不写就用不了外面的变量）
  同值保持原顺序   → 加 idx 字段，cmp 最后一行 return a.idx < b.idx`,
  },
  {
    title: "cmp 黄金法则 · 写错会 RE 不是 WA",
    category: "排序比较",
    isPinned: false,
    content: `cmp(a, b) 必须返回「a 是否严格小于 b」。
★ 相等时必须返回 false，绝不能返回 true ★

    ✅ return a.score > b.score;      // 相等 → false，正确
    ❌ return a.score >= b.score;     // 相等 → true，破坏严格弱序

写错的后果不是答案错，是「运行时崩溃(RE)」—— 标准库内部会越界。
这个坑很隐蔽：数据小的时候还能跑，数据一大就挂。

另外：最后一行兜底很重要。
只写 return a.score > b.score，同分时返回 false（表示"谁前谁后无所谓"），
sort 就会给出随机顺序 —— 这是"同分顺序乱了"类 WA 的根源。
加上 return a.idx < b.idx 后，任意两元素都能分出胜负，结果 100% 确定。`,
  },
  {
    title: "sort vs stable_sort · 保持原顺序的两种做法",
    category: "排序比较",
    isPinned: false,
    content: `题目常要求「同分时保持输入顺序」，两种解法：

// 方案一：stable_sort（相等元素保持原相对顺序）
stable_sort(v.begin(), v.end(),
            [](const Student& a, const Student& b){ return a.score > b.score; });

// 方案二：普通 sort + idx（推荐）
sort(v.begin(), v.end(), [](const Student& a, const Student& b) {
    if (a.score != b.score) return a.score > b.score;
    return a.idx < b.idx;
});

两者效果一样，但方案二更「显式」——
一眼看出这里在处理同分，而 stable_sort 是隐含约定，容易忘。

其他常用（都在 <algorithm>）：
    reverse(v.begin(), v.end());
    unique(v.begin(), v.end());        // 需先排序，返回新的尾迭代器
    lower_bound(v.begin(), v.end(), x);
    max_element(v.begin(), v.end());
    next_permutation(v.begin(), v.end());

⚠️ 用 sort 必须 #include <algorithm>。
不加有时也能编译过（被 <vector> 间接包含），但换编译器就挂 —— 别赌运气。`,
  },
  {
    title: "stringstream · 按分隔符切割字符串",
    category: "字符串",
    isPinned: true,
    content: `#include <sstream>

// ── 按自定义分隔符切（getline 第三个参数）──
stringstream ss("1.0.0.193");
string tok;
while (getline(ss, tok, '.')) {      // 分隔符换成 '.'
    // tok 依次是 "1" "0" "0" "193"
}

// ── 按空格切（用 >>，默认按空白分词）──
stringstream ss2("fang 90 male");
string w;
while (ss2 >> w) { }

// ── 混合读，自动类型转换 ──
stringstream ss3("fang 90");
string name; int score;
ss3 >> name >> score;                // score 直接是 int

⚠️ 重复使用必须重置（流是单向消耗的，读过就没了）：
    ss.clear();          // ① 清除 eof 标志，不清会读不出东西
    ss.str("新内容");     // ② 换内容

⚠️ 分隔符只能是单个 char。按 "::" 这种多字符分割得自己 find + substr。`,
  },
  {
    title: "find / substr 常用组合",
    category: "字符串",
    isPinned: false,
    content: `s.substr(i)          // 从 i 到结尾
s.substr(i, len)     // 从 i 取 len 个

需求                     写法
──────────────────────────────────────────────────────────────
取路径里的文件名          size_t p = s.find_last_of('\\\\');
                         string f = (p == string::npos) ? s : s.substr(p + 1);
取最后 N 个字符           s.size() > N ? s.substr(s.size() - N) : s
找第一个空格              s.find(' ')
判断包含子串              s.find("abc") != string::npos
判断 a 是 b 的前缀        b.size() >= a.size() && b.compare(0, a.size(), a) == 0
──────────────────────────────────────────────────────────────

⚠️ 三个坑
1. find 找不到返回 string::npos，必须判断，直接拿去 substr 会崩
2. 反斜杠在 C++ 字符串里要写两个：'\\\\' 才是一个 \\
3. size() 是无符号数！s.size() - N 当 N 更大时会变成天文数字，先判断大小`,
  },
  {
    title: "stoi / to_string 与类型转换",
    category: "字符串",
    isPinned: false,
    content: `stoi("042")          // 42        前导零无影响
stoi("12abc")        // 12        读到非数字就停，不报错
stoi("ff", 0, 16)    // 255       第三个参数指定进制
stoll("4294967295")  // long long  ★ 大数用这个
to_string(255)       // "255"

⚠️ stoi("") 或 stoi("abc") 会抛异常直接 RE。不确定时先判断：
    bool ok = !t.empty() && all_of(t.begin(), t.end(), ::isdigit);

⚠️ IP 地址转整数最大 4294967295，超 int 上限（21亿），
   必须用 long long 或 unsigned int，否则结果变负数。

字符判断（#include <cctype>）：
    isalpha(c)  isdigit(c)  isupper(c)  islower(c)
    toupper(c)  tolower(c)
传参最好转 unsigned char：isalpha((unsigned char)c)，负值 char 是未定义行为。`,
  },
  {
    title: "容器速查 · 什么时候用哪个",
    category: "容器",
    isPinned: false,
    content: `vector<T>            连续数组，随机访问 O(1)，尾部插入 O(1)。默认首选。
string               就是 vector<char> 的特化，支持 substr/find

map<K,V>             红黑树，键有序，增删查 O(log n)
unordered_map<K,V>   哈希表，键无序，平均 O(1)
  → 要「有序遍历 / 范围查询 / lower_bound」用 map；只要快用 unordered_map

set / unordered_set  同上，只存键（自动去重）
stack / queue        栈 / 队列
priority_queue       堆，默认大顶堆；小顶堆写 priority_queue<int, vector<int>, greater<int>>
deque                双端队列，头尾都能 O(1) 插入

⚠️ 排序题不要用 map 存数据！
   map 会自动按 key 排序 → 输入顺序直接丢了；同 key 还会互相覆盖。
   要保持输入顺序 + 允许重复 → 用 vector<struct>。

计数惯用法：
    unordered_map<string, int> cnt;
    cnt[key]++;                        // 不存在时自动初始化为 0

保序 + 计数（HJ19 那类题）：
    vector<string> order;              // 记首次出现顺序
    unordered_map<string, int> cnt;    // 记次数
    if (cnt.find(k) == cnt.end()) order.push_back(k);
    cnt[k]++;`,
  },
  {
    title: "踩坑清单 · 卡住先查这里",
    category: "踩坑",
    isPinned: true,
    content: `现象                      原因                    修法
────────────────────────────────────────────────────────────────────────────
第一行读到空串             cin >> 后残留换行        cin >> n; 后加 cin.ignore();
带空格的行被拆开           用了 cin >> s            改用 getline(cin, s)
数字算出来是负的           int 溢出（IP/大数）      换 long long
sort 崩溃(RE)不是 WA       cmp 写了 <= 或 >=        相等必须返回 false
同分顺序乱了               用了不稳定的 sort        加 idx 字段或用 stable_sort
本地对但线上一直 WA        输入含 \\r（Windows换行） if(!s.empty()&&s.back()=='\\r') s.pop_back();
输入读不完                 行数不定却用固定循环      while (getline(cin, line))
累加结果随机               忘了初始化累加器          int sum = 0;
────────────────────────────────────────────────────────────────────────────

未初始化变量：
  全局 / static  →  自动为 0 ✅
  局部（函数内）  →  垃圾值 ⚠️

声明这些时顺手写初值：
    int sum = 0;  int cnt = 0;
    int maxv = INT_MIN;  int minv = INT_MAX;
    bool found = false;
共同点是「先读后写」（要用旧值算新值），忘了初始化就是经典 bug，
而且本地可能碰巧是 0 跑对了，交上去就 WA。

竞赛技巧：大数组开成全局的 —— 既自动清零，又不占栈空间（局部大数组容易爆栈）。`,
  },
  {
    title: "Windows 本地环境四坑（PowerShell）",
    category: "踩坑",
    isPinned: false,
    content: `1. && 报错
   PowerShell 5.1 不支持 &&（那是 bash / PS7 的语法）
   改用：  g++ a.cpp -o a.exe; if ($?) { .\\a.exe }

2. 程序输出中文变乱码
   控制台默认 GBK，源码是 UTF-8。执行一次：
       [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
   永久生效：把这行加进 $PROFILE（notepad $PROFILE）

3. prog < input.txt 不工作
   PS 5.1 没有输入重定向，用 cmd 包一层：
       cmd /c "main.exe < input.txt"
   ⚠️ 也别用 Get-Content input.txt | .\\main.exe
      —— PowerShell 管道会给 exe 注入 3 字节 BOM，程序读到的第一行会多出不可见字符

4. bits/stdc++.h + -std=c++17 编译失败
   MinGW GCC 8.1.0 的 <filesystem> 实现有 bug。三种解法：
       g++ -std=c++14 ...        （万能头照用）
       或显式列头文件 + c++17
       或升级 MinGW
   ⚠️ 只是本地问题！牛客/CodeFun2000 是 Linux 新版 GCC，万能头 + c++17 完全正常。

想彻底躲开 1~3：VS Code 终端下拉菜单切到 Git Bash。`,
  },
];

// Seeds the starter notes the first time the page is opened. No-op afterwards,
// so a user who deletes them all doesn't get them back on the next visit
// (a marker row is left behind for that: we only seed when the table is empty
// AND has never been seeded — tracked by the presence of any row at all).
let seedInFlight: Promise<void> | null = null;

export function ensureAcmNotesSeeded() {
  if (!seedInFlight) {
    seedInFlight = doSeed().finally(() => {
      seedInFlight = null;
    });
  }
  return seedInFlight;
}

async function doSeed() {
  const db = getDb();
  const existing = await db.acmNote.count();
  if (existing > 0) {
    return;
  }
  await db.acmNote.createMany({
    data: SEED.map((note, index) => ({
      title: note.title,
      category: note.category,
      content: note.content,
      isPinned: note.isPinned,
      sortOrder: index,
    })),
  });
}

// Pinned first, then by explicit sortOrder, then newest-updated first.
export async function loadAcmNotes() {
  const db = getDb();
  const notes = await db.acmNote.findMany({
    orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
  });
  return notes.map((note) => ({
    id: note.id,
    title: note.title,
    category: note.category,
    content: note.content,
    isPinned: note.isPinned,
    updatedAt: note.updatedAt.toISOString(),
  }));
}

export type AcmNote = Awaited<ReturnType<typeof loadAcmNotes>>[number];
