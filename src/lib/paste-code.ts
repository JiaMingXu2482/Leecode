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
  /\bfor\s*\(.*;.*;.*\)/,
  /\bwhile\s*\(.*\)\s*\{/,
  /^\s*(return|break|continue)\b\s*[^一-鿿]*;/m,
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

export function fenceCode(text: string, language = "cpp"): string {
  const body = text.replace(/\s+$/, "");
  return `\`\`\`${language}\n${body}\n\`\`\`\n`;
}

// 光标处在不在一个未闭合的 ``` 围栏里 —— 在的话就不要再包一层。
// 传入光标之前的全部文本。
export function insideFence(textBeforeCursor: string): boolean {
  const fences = textBeforeCursor.match(/^\s*```/gm);
  return (fences?.length ?? 0) % 2 === 1;
}
