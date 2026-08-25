// 粘贴到笔记里的文本，判断是不是代码 —— 是的话自动包一层 ``` 围栏，渲染出来
// 就是代码框，和手写的中文说明分得开。
//
// 抽成纯函数是为了能单测：粘贴只能在真浏览器里手动试，而「什么算代码」恰恰是
// 最容易误判的地方。宁可漏判（当普通文本粘贴，用户自己补围栏），也不要误判把
// 中文笔记包成代码框。

const STRONG = [
  /^\s*#include\b/m,
  /^\s*using\s+namespace\b/m,
  /^\s*(public|private|protected)\s*:/m,
  /^\s*(def|class|import|from)\s+\w/m,
  /^\s*(int|void|bool|double|float|char|long|string|auto|vector|struct|template)\b.*[;{(]/m,
  // 控制结构：C 风格 for、范围 for、while / if / switch 带花括号、else。
  // 这些是最常单独粘贴的片段，不带 #include 之类的强特征。
  /\bfor\s*\(.*;.*;.*\)/,
  /\bfor\s*\([^)]*:[^)]*\)/,
  /\b(while|if|switch)\s*\(.+\)\s*\{/,
  /^\s*\}?\s*else\b/m,
  /^\s*(return|break|continue)\b\s*[^一-鿿]*;/m,
  // 单行也算代码：if(x) return; / a[i] = b; / cnt++;
  /^\s*(if|while|for)\s*\(.+\)\s*\S.*;\s*$/m,
  /^\s*[\w.[\]]+\s*(=|\+=|-=|\*=|\/=|%=)[^=].*;\s*$/m,
  /^\s*[\w.[\]]+(\+\+|--)\s*;\s*$/m,
];

// 一行「像代码」：以分号/花括号收尾，或者是明显的控制结构、赋值、调用。
function codeyLine(line: string): boolean {
  const t = line.trim();
  if (!t) {
    return false;
  }
  if (/[;{}]$/.test(t)) return true;
  if (/^[{}]+$/.test(t)) return true;
  if (/^(if|else|for|while|switch|case|do|try|catch)\b/.test(t)) return true;
  if (/^\w[\w.[\]]*\s*=[^=]/.test(t)) return true;
  if (/^\w+\s*\(.*\)\s*[;{]?$/.test(t)) return true;
  return false;
}

// 中文比例高的基本是笔记，不是代码。
function cjkRatio(text: string): number {
  const cjk = (text.match(/[一-鿿]/g) ?? []).length;
  return text.length ? cjk / text.length : 0;
}

export function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 8) {
    return false;
  }
  // 已经自带围栏的，原样粘贴即可。
  if (trimmed.includes("```")) {
    return false;
  }
  // 强信号优先于中文占比：用户习惯是在代码里写中文注释，一段带大量中文注释的
  // C++ 仍然是代码。
  if (STRONG.some((pattern) => pattern.test(trimmed))) {
    return true;
  }
  // 没有强信号时，中文占比超过三成当成笔记。
  if (cjkRatio(trimmed) > 0.3) {
    return false;
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return false;
  }
  const codey = lines.filter(codeyLine).length;
  return codey / lines.length >= 0.5;
}

// Windows 剪贴板给的是 \r\n。多出来的 \r 进了代码块会被渲染成额外空行 ——
// 看起来就是「每行代码中间都空了一行」。所以插入前统一成 \n。
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

// 对齐排版的文本（树形图、缩进的结构说明）。
//
// 为什么需要单独识别：Markdown 的普通段落存不住连续空格和行首缩进 —— toast-ui
// 的序列化器会把「下标1  下标2」压成「下标1 下标2」，树形图就散了。能原样保住
// 空格的只有代码块，所以这类文本粘贴时也包进围栏（不带语言，不做语法着色）。
export function looksLikeAsciiArt(text: string): boolean {
  const normalized = normalizeNewlines(text);
  if (normalized.includes("```")) {
    return false;
  }
  const lines = normalized.split("\n").filter((line) => line.trim());
  if (lines.length < 2) {
    return false;
  }
  // 行首缩进 2 空格以上，或者行内出现 2 个以上连续空格 —— 都是靠空格对齐的信号。
  const aligned = lines.filter(
    (line) => /^ {2,}\S/.test(line) || /\S {2,}\S/.test(line),
  ).length;
  if (aligned < 1) {
    return false;
  }
  // 至少有一行带这些「画图」字符，或者过半的行都在靠空格对齐。
  const arty = lines.some((line) => /[/\\|+_├└─┌┐┘┴┬┼]/.test(line));
  return arty || aligned / lines.length >= 0.5;
}

export function fenceCode(text: string, language = "cpp"): string {
  const body = normalizeNewlines(text).replace(/\s+$/, "");
  return `\`\`\`${language}\n${body}\n\`\`\`\n`;
}

// 光标处在不在一个未闭合的 ``` 围栏里 —— 在的话就不要再包一层。
// 传入光标之前的全部文本。
export function insideFence(textBeforeCursor: string): boolean {
  const fences = textBeforeCursor.match(/^\s*```/gm);
  return (fences?.length ?? 0) % 2 === 1;
}
