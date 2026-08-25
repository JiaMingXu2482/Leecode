import { CODEFUN_ID_BASE, CODEFUN_PROBLEMS } from "./codefun-problems";
import { NOWCODER_ID_BASE, NOWCODER_TOPIC_GROUPS } from "./nowcoder-problems";
import { highlightFence } from "./highlight";
import { parseImageWidth } from "./image-width";
import { escapeHtml } from "./notes";
import { TOPIC_GROUPS } from "./topics";

// 一个够用的 Markdown 渲染器。只覆盖算法笔记真正会用到的语法：标题、围栏代码块、
// 表格、有序/无序列表、引用、分隔线、粗体/斜体/删除线、行内代码、链接。
//
// 为什么不引 marked / markdown-it：线上是 docker build 里跑 npm ci，加依赖要重新
// 生成 lockfile，而这个项目在 Windows 生成、Linux 部署，之前已经踩过 EUSAGE。
// 自己写还能顺手做题号自动链接（见 linkProblemRefs），这是第三方库做不到的。
//
// 安全：所有文本先 escapeHtml，标签只由本文件生成，链接 href 走白名单。

const HOT100_IDS = new Set(TOPIC_GROUPS.flatMap((group) => group.ids));
const HJ_IDS = new Set(NOWCODER_TOPIC_GROUPS.flatMap((group) => group.ids));
const CODEFUN_ID_BY_PID = new Map(
  CODEFUN_PROBLEMS.map(([pid]) => [pid.toUpperCase(), CODEFUN_ID_BASE + Number(pid.slice(1))]),
);

export type TocEntry = { id: string; level: number; text: string };

function anchor(frontendId: number, label: string) {
  return `<a class="md-problem" href="/problems/by-number/${frontendId}">${label}</a>`;
}

// 把正文里的题号变成指向题目详情页的链接。
//   #53    → Hot100 第 53 题
//   HJ14   → 牛客 HJ14
//   P2352  → 速成题单 P2352
//   53     → 裸数字，只有确实是 Hot100 题号、且左右边界干净时才链接
// 裸数字的边界卡得很严，否则「第1阶段」「3-5道」「70%」「≤20」全会被误伤：
// 左边必须是行首/空白/逗号/左括号，右边必须是行尾/空白/标点/汉字。
export function linkProblemRefs(text: string) {
  let out = text;
  out = out.replace(/#(\d{1,4})\b/g, (match, digits: string) => {
    const id = Number(digits);
    return HOT100_IDS.has(id) ? anchor(id, match) : match;
  });
  out = out.replace(/\b(?:HJ|hj|Hj)(\d{1,3})\b/g, (match, digits: string) => {
    const n = Number(digits);
    return HJ_IDS.has(n) ? anchor(NOWCODER_ID_BASE + n, match) : match;
  });
  out = out.replace(/\bP(\d{4})\b/g, (match) => {
    const id = CODEFUN_ID_BY_PID.get(match.toUpperCase());
    return id ? anchor(id, match) : match;
  });
  out = out.replace(/(?<=^|[\s,，、([（])(\d{1,4})(?=$|[\s,，、)\]）。：:；;]|[一-鿿])/g, (match) => {
    const id = Number(match);
    return HOT100_IDS.has(id) ? anchor(id, match) : match;
  });
  return out;
}

function safeHref(raw: string) {
  const href = raw.trim();
  return /^(https?:\/\/|\/|#)/i.test(href) ? href : "";
}

// escapeHtml 只处理 & < >，不管引号 —— 放进元素内容里没问题，但放进属性值里
// 一个双引号就能闯出属性、注入 onerror 之类。凡是往 attr 里塞的都必须走这个。
function escapeAttr(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

// 行内语法。顺序有讲究：行内代码先切出来（里面一律不再处理），然后是 Markdown
// 链接（换成 <Ln> 占位符保护起来），再是题号，最后粗体/斜体，末尾还原链接。
//
// 占位符为什么安全：这一步的文本已经 escapeHtml 过，尖括号全变成了 &lt;/&gt;，
// 所以 "<" 不可能出现在正文里；而且 "<" 也不在裸数字规则认可的左边界字符集里，
// 题号匹配钻不进 <L0> 内部。
function renderInline(text: string) {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let html = escapeHtml(part);

      const slots: string[] = [];
      // 图片必须排在链接前面：!\[alt\](src) 的后半段本身就是合法链接语法，
      // 先跑链接会把它吃掉、只剩一个孤零零的 "!"。
      html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt: string, src: string) => {
        const safe = safeHref(src);
        if (!safe) {
          return match;
        }
        // 显示宽度编码在 URL 的 ?w= 里（见 lib/image-width.ts）——Markdown 的图片
        // 语法存不下尺寸，所以在编辑器里调过大小的图，靠这个参数在渲染时还原。
        const width = parseImageWidth(safe);
        const style = width ? ` style="width:${width}px"` : "";
        slots.push(
          `<img src="${escapeAttr(safe)}" alt="${escapeAttr(alt)}" loading="lazy"${style}>`,
        );
        return `<L${slots.length - 1}>`;
      });
      html = html.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
        const safe = safeHref(href);
        if (!safe) {
          return match;
        }
        slots.push(`<a href="${escapeAttr(safe)}" target="_blank" rel="noreferrer">${label}</a>`);
        return `<L${slots.length - 1}>`;
      });

      html = linkProblemRefs(html);
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
      html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");

      return html.replace(/<L(\d+)>/g, (_match, slot: string) => slots[Number(slot)]);
    })
    .join("");
}

// 表格分隔行。必须带 | —— 否则光是 `---` 也会匹配上，把分隔线误判成表格。
function isTableSeparator(line: string) {
  return line.includes("|") && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function isTableStart(lines: string[], index: number) {
  return lines[index].includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]);
}

function splitRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function alignments(separator: string) {
  return splitRow(separator).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return ' style="text-align:center"';
    if (right) return ' style="text-align:right"';
    return "";
  });
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const UL = /^\s*[-*+]\s+/;
const OL = /^\s*\d+[.)]\s+/;
const QUOTE = /^\s*>\s?/;
const FENCE = /^\s*```+\s*([\w+#-]*)\s*$/;

export function markdownToHtml(source: string): { html: string; toc: TocEntry[] } {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const toc: TocEntry[] = [];
  let headingCount = 0;
  let index = 0;

  const takeWhile = (matches: (line: string) => boolean) => {
    const block: string[] = [];
    while (index < lines.length && matches(lines[index])) {
      block.push(lines[index]);
      index += 1;
    }
    return block;
  };

  while (index < lines.length) {
    const line = lines[index];

    const fence = line.match(FENCE);
    if (fence) {
      const language = fence[1] ?? "";
      index += 1;
      const body: string[] = [];
      while (index < lines.length && !/^\s*```+\s*$/.test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1; // 吃掉结尾的 ```
      const languageClass = language ? ` class="language-${escapeHtml(language)}"` : "";
      const label = language ? ` data-lang="${escapeHtml(language)}"` : "";
      // highlightFence 自己会转义；认不出的语言它原样转义后返回。
      out.push(`<pre${label}><code${languageClass}>${highlightFence(body.join("\n"), language)}</code></pre>`);
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (HR.test(line)) {
      out.push("<hr>");
      index += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      headingCount += 1;
      const id = `s${headingCount}`;
      toc.push({ id, level, text });
      out.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const header = splitRow(line);
      const align = alignments(lines[index + 1]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes("|")) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      const head = header.map((cell, i) => `<th${align[i] ?? ""}>${renderInline(cell)}</th>`).join("");
      const body = rows
        .map(
          (row) =>
            `<tr>${header
              .map((_cell, i) => `<td${align[i] ?? ""}>${renderInline(row[i] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      out.push(
        `<div class="md-table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }

    if (UL.test(line)) {
      const block = takeWhile((entry) => UL.test(entry));
      const items = block.map((entry) => `<li>${renderInline(entry.replace(UL, ""))}</li>`).join("");
      out.push(`<ul>${items}</ul>`);
      continue;
    }

    if (OL.test(line)) {
      const block = takeWhile((entry) => OL.test(entry));
      const start = Number(block[0].match(/^\s*(\d+)/)?.[1] ?? 1);
      const items = block.map((entry) => `<li>${renderInline(entry.replace(OL, ""))}</li>`).join("");
      out.push(`<ol${start === 1 ? "" : ` start="${start}"`}>${items}</ol>`);
      continue;
    }

    if (QUOTE.test(line)) {
      const block = takeWhile((entry) => QUOTE.test(entry));
      const text = block.map((entry) => entry.replace(QUOTE, "")).join(" ");
      out.push(`<blockquote>${renderInline(text)}</blockquote>`);
      continue;
    }

    // 段落：连续的普通行合成一段。要在这里再判一次表格开头，否则表头那行
    // （一行普通文字带 |）会被段落吞掉，整张表就散了。
    const paragraph: string[] = [];
    while (index < lines.length) {
      const entry = lines[index];
      if (
        !entry.trim() ||
        FENCE.test(entry) ||
        HEADING.test(entry) ||
        HR.test(entry) ||
        UL.test(entry) ||
        OL.test(entry) ||
        QUOTE.test(entry) ||
        isTableStart(lines, index)
      ) {
        break;
      }
      paragraph.push(entry);
      index += 1;
    }
    if (!paragraph.length) {
      index += 1; // 兜底：每轮循环都必须让 index 前进，否则死循环
      continue;
    }
    out.push(`<p>${paragraph.map((entry) => renderInline(entry.trim())).join("<br>")}</p>`);
  }

  return { html: out.join("\n"), toc };
}

// 正文里引用到的题号，用来在题目详情页反向显示「相关算法总结」。
// 代码块内容不算引用 —— dp[i-1]、1<<n 这种全是数字。
export function extractProblemRefs(source: string): number[] {
  const withoutCode = source.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const linked = linkProblemRefs(escapeHtml(withoutCode));
  const found = new Set<number>();
  for (const match of linked.matchAll(/\/problems\/by-number\/(\d+)/g)) {
    found.add(Number(match[1]));
  }
  return [...found].sort((a, b) => a - b);
}
