import { describe, expect, it } from "vitest";
import { extractProblemRefs, markdownToHtml } from "./markdown";

const render = (source: string) => markdownToHtml(source).html;

describe("markdownToHtml", () => {
  it("渲染各级标题并产出目录", () => {
    const { html, toc } = markdownToHtml("# DP 的主要类型\n## 一、线性DP\n### 模板");
    expect(html).toContain('<h1 id="s1">DP 的主要类型</h1>');
    expect(html).toContain('<h2 id="s2">一、线性DP</h2>');
    expect(toc).toEqual([
      { id: "s1", level: 1, text: "DP 的主要类型" },
      { id: "s2", level: 2, text: "一、线性DP" },
      { id: "s3", level: 3, text: "模板" },
    ]);
  });

  it("围栏代码块保留原文并带上语言", () => {
    const html = render("```cpp\nfor (int i = 1; i <= n; ++i)\n  dp[i] = max(a, b);\n```");
    expect(html).toContain('<pre data-lang="cpp"><code class="language-cpp">');
    expect(html).toContain("for (int i = 1; i &lt;= n; ++i)");
    expect(html).toContain("dp[i] = max(a, b);");
  });

  it("代码块里不做任何行内处理", () => {
    const html = render("```\ndp[i] = **not bold** and `not code` and 53\n```");
    expect(html).toContain("**not bold**");
    expect(html).not.toContain("<strong>");
    expect(html).not.toContain("md-problem");
  });

  it("渲染表格，含对齐", () => {
    const html = render("| 类型 | 频率 |\n|:---|---:|\n| 线性DP | 极高 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>类型</th>");
    expect(html).toContain('<th style="text-align:right">频率</th>');
    expect(html).toContain("<td>线性DP</td>");
    expect(html).toContain('<td style="text-align:right">极高</td>');
  });

  it("表格紧跟在段落后面也能认出来", () => {
    const html = render("下面是优先级：\n| 类型 | 频率 |\n|---|---|\n| 线性DP | 极高 |");
    expect(html).toContain("<p>下面是优先级：</p>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("<p>| 类型");
  });

  it("区分分隔线和表格分隔行", () => {
    expect(render("段落\n\n---\n\n下一段")).toContain("<hr>");
    expect(render("---")).toBe("<hr>");
    expect(render("| a |\n|---|\n| b |")).not.toContain("<hr>");
  });

  it("渲染有序和无序列表", () => {
    expect(render("- 一\n- 二")).toBe("<ul><li>一</li><li>二</li></ul>");
    expect(render("1. 定义状态\n2. 枚举选择")).toBe(
      "<ol><li>定义状态</li><li>枚举选择</li></ol>",
    );
  });

  it("行内：粗体、行内代码、删除线", () => {
    const html = render("**线性DP** 用 `dp[i]` 表示，~~废弃~~");
    expect(html).toContain("<strong>线性DP</strong>");
    expect(html).toContain("<code>dp[i]</code>");
    expect(html).toContain("<del>废弃</del>");
  });

  it("转义 HTML，不让笔记注入标签", () => {
    const html = render("正文 <img src=x onerror=alert(1)> 结束");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("只允许 http/https/站内链接", () => {
    expect(render("[点我](https://codefun2000.com/p/P2352)")).toContain(
      'href="https://codefun2000.com/p/P2352"',
    );
    expect(render("[坏链接](javascript:alert(1))")).not.toContain("<a href=\"javascript");
  });
});

describe("图片", () => {
  it("渲染 ![alt](src)", () => {
    const html = render("![邻接表](/api/note-images/abc123)");
    expect(html).toContain('<img src="/api/note-images/abc123"');
    expect(html).toContain('alt="邻接表"');
    expect(html).toContain('loading="lazy"');
  });

  it("图片不会被链接语法吃掉（! 不能落单）", () => {
    const html = render("![图](/x.png)");
    expect(html).toContain("<img");
    expect(html).not.toContain("!<a");
    expect(html).not.toMatch(/>!</);
  });

  it("同一行里图片和链接都能认", () => {
    const html = render("看图 ![图](/a.png) 和 [文档](https://example.com)");
    expect(html).toContain('<img src="/a.png"');
    expect(html).toContain('href="https://example.com"');
  });

  it("挡掉 javascript: 之类的 src", () => {
    const html = render("![x](javascript:alert(1))");
    expect(html).not.toContain("<img");
  });

  it("属性值里的引号必须转义，不能闯出属性", () => {
    // escapeHtml 不管引号，直接插进 attr 就能注入 onerror
    const html = render('![a" onerror="alert(1)](/x.png)');
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot;");
  });

  it("src 里的引号同样要转义", () => {
    const html = render('![x](/a.png" onerror="alert(1))');
    expect(html).not.toContain('onerror="alert(1)"');
  });

  it("代码块里的图片语法不渲染", () => {
    const html = render(["```", "![图](/a.png)", "```"].join("\n"));
    expect(html).not.toContain("<img");
    expect(html).toContain("![图](/a.png)");
  });
});

describe("题号自动链接", () => {
  it("#53 这种带井号的直接链", () => {
    expect(render("看 #53 就懂了")).toContain('href="/problems/by-number/53"');
  });

  it("HJ 和 P 开头的按各自题库链", () => {
    expect(render("参考 HJ14")).toContain('href="/problems/by-number/10014"');
    // P 号直接推 id：P2352 → 20000 + 2352
    expect(render("参考 P2352")).toContain('href="/problems/by-number/22352"');
  });

  it("裸数字：确实是 Hot100 题号才链", () => {
    const html = render("代表题 53,198,300 三道");
    expect(html).toContain('href="/problems/by-number/53"');
    expect(html).toContain('href="/problems/by-number/198"');
    expect(html).toContain('href="/problems/by-number/300"');
  });

  it("裸数字：不是 Hot100 题号的不链", () => {
    // 1039、312 都不在这个 App 的 Hot100 集合里，链过去会 404
    const html = render("1039 多边形三角剖分 312 戳气球");
    expect(html).not.toContain("md-problem");
  });

  it("不误伤正文里的普通数字", () => {
    for (const text of ["第1阶段（必掌握）", "每种类型做3-5道", "占面试DP的70%", "通常≤20", "Hot100代表"]) {
      expect(render(text), text).not.toContain("md-problem");
    }
  });

  it("数字后面接汉字算题号（代表题写法）", () => {
    expect(render("53 最大子数组和")).toContain('href="/problems/by-number/53"');
  });

  it("表格单元格里的题号也链", () => {
    const html = render("| 类型 | 代表 |\n|---|---|\n| 线性DP | 53,198 |");
    expect(html).toContain('href="/problems/by-number/53"');
    expect(html).toContain('href="/problems/by-number/198"');
  });

  it("不钻进 Markdown 链接的 href 里", () => {
    const html = render("[题解](https://example.com/a/53/b)");
    expect(html).toContain('href="https://example.com/a/53/b"');
    expect(html).not.toContain("by-number/53");
  });

  it("不重复包裹已经链过的题号", () => {
    const html = render("#53 和 53 都在");
    expect([...html.matchAll(/md-problem/g)]).toHaveLength(2);
    expect(html).not.toContain("<a class=\"md-problem\" href=\"/problems/by-number/53\"><a");
  });
});

describe("extractProblemRefs", () => {
  it("抽出正文引用的题号，代码块里的不算", () => {
    const source = [
      "## 线性DP",
      "代表题 #53 和 198。",
      "```cpp",
      "dp[70] = 322;",
      "```",
      "还有 HJ14。",
    ].join("\n");
    expect(extractProblemRefs(source)).toEqual([53, 198, 10014]);
  });

  it("去重并排序", () => {
    expect(extractProblemRefs("#53 53 #53")).toEqual([53]);
  });

  it("没有引用时返回空数组", () => {
    expect(extractProblemRefs("纯文字，没有题号")).toEqual([]);
  });
});
