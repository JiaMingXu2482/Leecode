import { describe, expect, it } from "vitest";
import { fenceCode, insideFence, looksLikeCode } from "./paste-code";

describe("looksLikeCode", () => {
  it("认出 C++ 代码", () => {
    expect(
      looksLikeCode(`#include <bits/stdc++.h>
using namespace std;
int main() {
  int n; cin >> n;
  return 0;
}`),
    ).toBe(true);
  });

  it("认出片段式代码（没有 include）", () => {
    expect(
      looksLikeCode(`for (int i = 0; i < n; ++i) {
  dp[i] = max(dp[i - 1], a[i]);
}`),
    ).toBe(true);
  });

  it("认出 Python", () => {
    expect(looksLikeCode("def dfs(i, cur):\n    if i == n:\n        return")).toBe(true);
  });

  it("中文笔记不当代码", () => {
    expect(
      looksLikeCode(`用选与不选，同一个数可以重复选，框架对了
这题dfs中有好多return
dfs中return分3类
1.边界；2.剪枝；3.成功出口`),
    ).toBe(false);
  });

  it("单行普通文字不当代码", () => {
    expect(looksLikeCode("这题用回溯就行")).toBe(false);
    expect(looksLikeCode("see the editorial")).toBe(false);
  });

  it("太短的不当代码", () => {
    expect(looksLikeCode("i++;")).toBe(false);
  });

  it("已经带围栏的不再包一层", () => {
    expect(looksLikeCode("```cpp\nint x = 0;\nreturn x;\n```")).toBe(false);
  });

  it("中英混排的说明文字不当代码", () => {
    expect(
      looksLikeCode(`这里的 dfs(i, num) 表示第 i 个数还剩 num
注意 return 的三种情况都要写全`),
    ).toBe(false);
  });
});

describe("fenceCode", () => {
  it("包成 cpp 围栏", () => {
    expect(fenceCode("int x;")).toBe("```cpp\nint x;\n```\n");
  });

  it("去掉尾部空白", () => {
    expect(fenceCode("int x;\n\n  ")).toBe("```cpp\nint x;\n```\n");
  });
});

describe("insideFence", () => {
  it("围栏内返回 true", () => {
    expect(insideFence("说明\n```cpp\nint x;")).toBe(true);
  });

  it("围栏已闭合返回 false", () => {
    expect(insideFence("```cpp\nint x;\n```\n后面")).toBe(false);
  });

  it("没有围栏返回 false", () => {
    expect(insideFence("就是一段说明")).toBe(false);
  });
});
