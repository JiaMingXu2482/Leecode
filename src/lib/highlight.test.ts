import { describe, expect, it } from "vitest";
import { highlightFence } from "./highlight";

describe("highlightFence", () => {
  it("给 C++ 的类型和注释着色", () => {
    const html = highlightFence("int x = 0; // hi", "cpp");
    expect(html).toContain('<span class="hljs-type">int</span>');
    expect(html).toContain('<span class="hljs-comment">// hi</span>');
  });

  it("认得常见别名", () => {
    for (const alias of ["c", "cc", "hpp", "C++", " CPP "]) {
      expect(highlightFence("int x;", alias), alias).toContain("hljs-type");
    }
    expect(highlightFence("def f():\n  pass", "py")).toContain("hljs-keyword");
  });

  it("不认识的语言原样转义，不着色", () => {
    const html = highlightFence("SELECT * FROM t WHERE a < 1", "sql");
    expect(html).not.toContain("<span");
    expect(html).toContain("&lt;");
  });

  it("尖括号被转义（hljs 自己会转，不能再转一遍）", () => {
    const html = highlightFence("vector<int> v;", "cpp");
    expect(html).toContain("&lt;");
    expect(html).not.toContain("&amp;lt;");
  });

  it("代码里的 HTML 不会变成真标签", () => {
    const html = highlightFence('string s = "<img src=x onerror=alert(1)>";', "cpp");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("语法不完整也不抛异常", () => {
    expect(() => highlightFence("int main( {{{ unterminated", "cpp")).not.toThrow();
  });
});
