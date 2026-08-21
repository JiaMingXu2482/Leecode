import hljs from "highlight.js/lib/core";
import cpp from "highlight.js/lib/languages/cpp";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import { escapeHtml } from "./notes";

// 代码块着色，用 highlight.js。
//
// 为什么是它：零依赖、纯 JS，服务端和浏览器都能跑（markdown.ts 两边都会执行）。
// 对比过的另外两个：prismjs 同样零依赖但语法覆盖弱一些；shiki 效果最好，但要拉
// 8 个依赖（TextMate 语法包 + oniguruma WASM 引擎），对一个笔记应用过重。
//
// 只引 core + 实际会用到的几种语言，不引 highlight.js 主包 —— 主包 5.4MB，带
// 190 多种语言，全进 bundle 没必要。
//
// 注意：hljs 的输出已经转义过了，不要再 escapeHtml 一遍，否则尖括号会变成
// &amp;lt;。走不到 hljs 的分支才需要自己转义。
//
// 样式在 globals.css 里，按 hljs-* 类名给了亮/暗两套颜色。

hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("python", python);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);

// 笔记里写的别名 → hljs 的语言名
const ALIASES: Record<string, string> = {
  c: "cpp",
  cc: "cpp",
  h: "cpp",
  hpp: "cpp",
  cpp: "cpp",
  "c++": "cpp",
  py: "python",
  python: "python",
  java: "java",
  js: "javascript",
  javascript: "javascript",
  ts: "javascript",
  typescript: "javascript",
};

export function highlightFence(code: string, language: string): string {
  const name = ALIASES[language.trim().toLowerCase()];
  if (!name) {
    // 不认识的语言（sql、json、纯文本…）原样显示，不猜也不涂色。
    return escapeHtml(code);
  }
  try {
    return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}
