import { describe, expect, it } from "vitest";
import { escapeHtml, noteToHtml, noteToPlainText, RICH_PREFIX } from "./notes";

describe("escapeHtml", () => {
  it("escapes angle brackets and ampersands", () => {
    expect(escapeHtml("vector<int>& a")).toBe("vector&lt;int&gt;&amp; a");
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("dfs(l, r, n);")).toBe("dfs(l, r, n);");
  });
});

describe("noteToHtml", () => {
  it("renders legacy plain-text notes with escaped HTML and <br> line breaks", () => {
    const legacy = "第一行\nvector<int> v;\r\n第三行";
    expect(noteToHtml(legacy)).toBe("第一行<br>vector&lt;int&gt; v;<br>第三行");
  });

  it("keeps C++ generics in legacy notes visible instead of parsing them as tags", () => {
    const legacy = "unordered_map<int, vector<int>> g;";
    const html = noteToHtml(legacy);
    expect(html).not.toContain("<int");
    expect(html).toContain("&lt;int, vector&lt;int&gt;&gt;");
  });

  it("passes rich notes through without the marker prefix", () => {
    const rich = `${RICH_PREFIX}<b>思路</b><br><font color="#f59e0b">注意边界</font>`;
    expect(noteToHtml(rich)).toBe('<b>思路</b><br><font color="#f59e0b">注意边界</font>');
  });

  it("returns an empty string for an empty note", () => {
    expect(noteToHtml("")).toBe("");
  });

  it("only treats the marker as rich when it is a prefix", () => {
    const legacy = `代码里出现了 ${RICH_PREFIX} 字样`;
    expect(noteToHtml(legacy)).toContain("&lt;!--rt1--&gt;");
  });
});

describe("noteToPlainText", () => {
  it("returns plain notes unchanged", () => {
    const plain = "第一行\n    dfs(l, r, n);\n第三行";
    expect(noteToPlainText(plain)).toBe(plain);
  });

  it("flattens rich notes: tags dropped, <br> and <div> become line breaks", () => {
    const rich = `${RICH_PREFIX}要么<br><b>加粗的思路</b><div>    t.pop_back();</div><div>l--;</div>`;
    expect(noteToPlainText(rich)).toBe("要么\n加粗的思路\n    t.pop_back();\nl--;");
  });

  it("decodes escaped C++ generics and entities", () => {
    const rich = `${RICH_PREFIX}vector&lt;int&gt;&amp; v;&nbsp;s = &quot;ab&quot;`;
    expect(noteToPlainText(rich)).toBe('vector<int>& v; s = "ab"');
  });

  it("drops font/span styling but keeps the text", () => {
    const rich = `${RICH_PREFIX}<font color="#ef4444">红色重点</font><span style="background-color: rgb(245, 158, 11);">高亮</span>`;
    expect(noteToPlainText(rich)).toBe("红色重点高亮");
  });

  it("does not leave a leading blank line when the note starts with a div", () => {
    const rich = `${RICH_PREFIX}<div>第一行</div><div>第二行</div>`;
    expect(noteToPlainText(rich)).toBe("第一行\n第二行");
  });
});
