import { describe, expect, it } from "vitest";
import { stripMarkdown } from "./strip-markdown";

describe("stripMarkdown", () => {
  it("removes bold markers, keeping the text", () => {
    expect(stripMarkdown("你当前每天排 **4 道新题**。")).toBe("你当前每天排 4 道新题。");
  });

  it("removes italic markers without eating multiplication or bare asterisks", () => {
    expect(stripMarkdown("这是 *重点* 内容")).toBe("这是 重点 内容");
    expect(stripMarkdown("复杂度 O(n * m)")).toBe("复杂度 O(n * m)");
  });

  it("removes inline code backticks and headings", () => {
    expect(stripMarkdown("调用 `regenerate_week` 完成")).toBe("调用 regenerate_week 完成");
    expect(stripMarkdown("## 当前设置\n每天 4 道")).toBe("当前设置\n每天 4 道");
  });

  it("turns list bullets into a plain middot", () => {
    expect(stripMarkdown("- 回溯\n- 贪心算法")).toBe("· 回溯\n· 贪心算法");
    expect(stripMarkdown("* 动态规划")).toBe("· 动态规划");
  });

  it("leaves plain replies untouched", () => {
    const plain = "已按当前设置重排本周，优先类别每天各取一道新题。";
    expect(stripMarkdown(plain)).toBe(plain);
  });
});
