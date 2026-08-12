// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachCopyButtons } from "./code-copy";
import { markdownToHtml } from "./markdown";

function mount(markdown: string) {
  const root = document.createElement("div");
  root.innerHTML = markdownToHtml(markdown).html;
  document.body.appendChild(root);
  return root;
}

const TWO_BLOCKS = [
  "```cpp",
  "dp[i] = max(a, b);",
  "```",
  "中间一段话",
  "```",
  "sort(v.begin(), v.end());",
  "```",
].join("\n");

describe("attachCopyButtons", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("每个代码块加一个按钮", () => {
    const root = mount(TWO_BLOCKS);
    attachCopyButtons(root, async () => {});
    expect(root.querySelectorAll("[data-copy]")).toHaveLength(2);
    expect(root.querySelectorAll("pre.group.relative")).toHaveLength(2);
  });

  it("重复调用不会加出第二个按钮", () => {
    const root = mount(TWO_BLOCKS);
    attachCopyButtons(root, async () => {});
    attachCopyButtons(root, async () => {});
    expect(root.querySelectorAll("[data-copy]")).toHaveLength(2);
  });

  it("点按钮复制的是所在代码块的原文", async () => {
    const root = mount(TWO_BLOCKS);
    const copied: string[] = [];
    attachCopyButtons(root, async (text) => {
      copied.push(text);
    });
    const buttons = root.querySelectorAll<HTMLElement>("[data-copy]");
    buttons[1].click();
    await Promise.resolve();
    expect(copied).toEqual(["sort(v.begin(), v.end());"]);
  });

  it("复制的是原始字符，不是转义后的实体", async () => {
    const root = mount("```cpp\nfor (int i = 0; i < n && a > b; ++i)\n```");
    const copied: string[] = [];
    attachCopyButtons(root, async (text) => {
      copied.push(text);
    });
    root.querySelector<HTMLElement>("[data-copy]")!.click();
    await Promise.resolve();
    expect(copied[0]).toBe("for (int i = 0; i < n && a > b; ++i)");
  });

  it("复制成功后按钮文案变「已复制」，稍后恢复", async () => {
    vi.useFakeTimers();
    const root = mount("```\nabc\n```");
    attachCopyButtons(root, async () => {}, 1500);
    const button = root.querySelector<HTMLElement>("[data-copy]")!;
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(button.textContent).toBe("已复制");
    await vi.advanceTimersByTimeAsync(1500);
    expect(button.textContent).toBe("复制");
    vi.useRealTimers();
  });

  it("复制失败给出反馈，不静默", async () => {
    const root = mount("```\nabc\n```");
    attachCopyButtons(root, async () => {
      throw new Error("clipboard blocked");
    });
    const button = root.querySelector<HTMLElement>("[data-copy]")!;
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(button.textContent).toBe("复制失败");
  });

  it("点代码块的其他地方不触发复制", async () => {
    const root = mount("```\nabc\n```");
    const copied: string[] = [];
    attachCopyButtons(root, async (text) => {
      copied.push(text);
    });
    root.querySelector("code")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(copied).toEqual([]);
  });

  it("cleanup 之后不再响应点击", async () => {
    const root = mount("```\nabc\n```");
    const copied: string[] = [];
    const cleanup = attachCopyButtons(root, async (text) => {
      copied.push(text);
    });
    cleanup();
    root.querySelector<HTMLElement>("[data-copy]")!.click();
    await Promise.resolve();
    expect(copied).toEqual([]);
  });

  it("没有代码块时什么也不做", () => {
    const root = mount("就是一段普通文字。");
    attachCopyButtons(root, async () => {});
    expect(root.querySelectorAll("[data-copy]")).toHaveLength(0);
  });
});
